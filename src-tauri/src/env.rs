use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};

// --- Ports of electron/main/env.ts + shell.ts --------------------------------
// GUI PATH problem: a GUI-launched app inherits only launchd's minimal env, so
// `claude`/`codex`/Homebrew/mise aren't on PATH. We fix it once by running the
// user's LOGIN + INTERACTIVE shell, dumping its env between sentinels, and
// injecting the result into every spawned PTY and probe.

const BEGIN: &str = "__GC_ENV_BEGIN__";
const END: &str = "__GC_ENV_END__";

static ENV_CACHE: OnceLock<HashMap<String, String>> = OnceLock::new();
static RESOLVE_CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();

/// The user's login shell, with a sane fallback.
pub fn login_shell(env: &HashMap<String, String>) -> String {
    env.get("SHELL")
        .cloned()
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("SHELL").ok())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "/bin/zsh".to_string())
}

/// POSIX single-quote a string for safe interpolation into a shell command.
pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn compute_login_env() -> HashMap<String, String> {
    let mut env: HashMap<String, String> = std::env::vars().collect();
    if cfg!(target_os = "windows") {
        return env;
    }
    let shell = login_shell(&env);
    let script = format!("printf '%s\\n' '{BEGIN}'; /usr/bin/env; printf '%s\\n' '{END}'");
    if let Some(raw) = run_capture(&shell, &["-ilc", &script], &env, 6000) {
        if let (Some(b), Some(e)) = (raw.find(BEGIN), raw.find(END)) {
            if e > b {
                let block = &raw[b + BEGIN.len()..e];
                for line in block.lines() {
                    let Some(eq) = line.find('=') else { continue };
                    if eq == 0 {
                        continue;
                    }
                    let key = &line[..eq];
                    // Shell-instance cruft — never carry into spawned PTYs.
                    if matches!(key, "_" | "OLDPWD" | "PWD" | "SHLVL") {
                        continue;
                    }
                    env.insert(key.to_string(), line[eq + 1..].to_string());
                }
            }
        }
    }
    env
}

/// Login + interactive shell environment, computed once and cached.
pub fn capture_login_env() -> HashMap<String, String> {
    ENV_CACHE.get_or_init(compute_login_env).clone()
}

/// Warm the cache early so the first spawn is fast.
pub fn warm_env() {
    let _ = capture_login_env();
}

/// Run a bounded command to completion and return its stdout, or None on
/// spawn error / non-zero exit-with-empty / timeout (the child is SIGKILL'd).
/// Used only for short probes (env capture, `command -v`, `--version`).
pub fn run_capture(
    program: &str,
    args: &[&str],
    envs: &HashMap<String, String>,
    timeout_ms: u64,
) -> Option<String> {
    use std::sync::mpsc;
    let child = Command::new(program)
        .args(args)
        .envs(envs)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let pid = child.id();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });
    match rx.recv_timeout(std::time::Duration::from_millis(timeout_ms)) {
        Ok(Ok(out)) => Some(String::from_utf8_lossy(&out.stdout).into_owned()),
        Ok(Err(_)) => None,
        Err(_) => {
            // Timed out — SIGKILL the child so it can't linger.
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
            None
        }
    }
}

/// Resolve an agent binary on PATH via the login shell. A bare path (no
/// whitespace) means a real binary; an alias/function is rejected. Cached per
/// bin. Mirrors resolveAgent in electron/main/agents.ts.
pub fn resolve_bin(bin: &str) -> Option<String> {
    let cache = RESOLVE_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(hit) = cache.lock().unwrap().get(bin).cloned() {
        return hit;
    }
    let env = capture_login_env();
    let shell = login_shell(&env);
    let cmd = format!("command -v {}", shell_quote(bin));
    let resolved = run_capture(&shell, &["-lc", &cmd], &env, 5000).and_then(|out| {
        let candidate = out
            .lines()
            .map(|l| l.trim())
            .rfind(|l| !l.is_empty())
            .map(str::to_string)?;
        if candidate.contains(char::is_whitespace) {
            None
        } else {
            Some(candidate)
        }
    });
    cache
        .lock()
        .unwrap()
        .insert(bin.to_string(), resolved.clone());
    resolved
}
