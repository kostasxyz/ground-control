use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use crate::env::{capture_login_env, login_shell, resolve_bin, run_capture, shell_quote};
use crate::model::{AgentInfo, SessionPrepareOptions, SessionPrepareResult};
use serde_json::{json, Value};

// --- Tool-adapter seam (port of electron/main/agents.ts) ---------------------
// Everything agent-CLI-specific: how each binary is located/versioned and how a
// resumable session id is acquired (assign / precreate / fresh) and how the CLI
// is invoked fresh vs resume.

pub const AGENT_IDS: [&str; 6] = ["claude", "pi", "codex", "opencode", "cursor", "droid"];

/// The binary name to look up for an agent id.
pub fn agent_bin(id: &str) -> Option<&'static str> {
    match id {
        "claude" => Some("claude"),
        "pi" => Some("pi"),
        "codex" => Some("codex"),
        "opencode" => Some("opencode"),
        "cursor" => Some("cursor-agent"),
        "droid" => Some("droid"),
        _ => None,
    }
}

fn agent_version(path: &str) -> Option<String> {
    let env = capture_login_env();
    let shell = login_shell(&env);
    let cmd = format!("{} --version", shell_quote(path));
    let out = run_capture(&shell, &["-lc", &cmd], &env, 6000)?;
    out.trim()
        .lines()
        .next_back()
        .map(|l| l.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Probe every known agent CLI — presence + version — for the picker.
pub fn agent_infos() -> HashMap<String, AgentInfo> {
    AGENT_IDS
        .into_iter()
        .map(|id| {
            thread::spawn(move || {
                let bin = agent_bin(id).unwrap();
                let path = resolve_bin(bin);
                let version = path.as_deref().and_then(agent_version);
                (
                    id.to_string(),
                    AgentInfo {
                        found: path.is_some(),
                        path,
                        version,
                    },
                )
            })
        })
        .collect::<Vec<_>>()
        .into_iter()
        .filter_map(|handle| handle.join().ok())
        .collect()
}

// --- Spawn planning ----------------------------------------------------------

pub struct SpawnPlan {
    /// Args after the binary (already unquoted).
    pub argv: Vec<String>,
}

/// `cursor-agent create-chat` prints a fresh chat UUID to stdout.
fn cursor_create_chat(bin_path: &str) -> Option<String> {
    let env = capture_login_env();
    let shell = login_shell(&env);
    let cmd = format!("{} create-chat", shell_quote(bin_path));
    let out = run_capture(&shell, &["-lc", &cmd], &env, 10000)?;
    let id = out
        .lines()
        .map(|l| l.trim())
        .rfind(|l| !l.is_empty())?
        .to_string();
    // Loose hex/uuid shape check: >=16 chars of [0-9a-fA-F-].
    let ok = id.len() >= 16 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    if ok {
        Some(id)
    } else {
        None
    }
}

fn write_json_line(stdin: &mut impl Write, value: Value) -> Result<(), String> {
    let line = serde_json::to_string(&value).map_err(|e| e.to_string())?;
    stdin
        .write_all(line.as_bytes())
        .map_err(|e| e.to_string())?;
    stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

fn response_error(value: &Value) -> Option<String> {
    value.get("error").map(|error| {
        error
            .get("message")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| error.to_string())
    })
}

fn recv_response(
    rx: &mpsc::Receiver<Result<Value, String>>,
    id: i64,
    deadline: Instant,
) -> Result<Value, String> {
    loop {
        let now = Instant::now();
        if now >= deadline {
            return Err("Timed out waiting for codex app-server.".into());
        }
        match rx.recv_timeout(deadline.saturating_duration_since(now)) {
            Ok(Ok(value)) => {
                if value.get("id").and_then(Value::as_i64) != Some(id) {
                    continue;
                }
                if let Some(error) = response_error(&value) {
                    return Err(error);
                }
                return Ok(value);
            }
            Ok(Err(error)) => return Err(error),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                return Err("Timed out waiting for codex app-server.".into());
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err("codex app-server exited before responding.".into());
            }
        }
    }
}

fn codex_create_thread(bin_path: &str, cwd: &str, title: &str) -> Result<String, String> {
    let env = capture_login_env();
    let mut child = Command::new(bin_path)
        .arg("app-server")
        .current_dir(cwd)
        .envs(&env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not start codex app-server: {e}"))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Could not open codex app-server stdin.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not open codex app-server stdout.".to_string())?;

    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = match line {
                Ok(line) => line,
                Err(e) => {
                    let _ = tx.send(Err(e.to_string()));
                    return;
                }
            };
            if line.trim().is_empty() {
                continue;
            }
            let parsed = serde_json::from_str::<Value>(&line).map_err(|e| e.to_string());
            let _ = tx.send(parsed);
        }
    });

    let result = (|| {
        write_json_line(
            &mut stdin,
            json!({
                "method": "initialize",
                "id": 0,
                "params": {
                    "clientInfo": {
                        "name": "ground_control",
                        "title": "Ground Control",
                        "version": env!("CARGO_PKG_VERSION")
                    },
                    "capabilities": { "experimentalApi": true }
                }
            }),
        )?;
        write_json_line(&mut stdin, json!({ "method": "initialized", "params": {} }))?;
        write_json_line(
            &mut stdin,
            json!({
                "method": "thread/start",
                "id": 1,
                "params": { "cwd": cwd }
            }),
        )?;

        let started = recv_response(&rx, 1, Instant::now() + Duration::from_secs(12))?;
        let thread_id = started
            .pointer("/result/thread/id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .ok_or_else(|| "codex app-server did not return a thread id.".to_string())?
            .to_string();

        write_json_line(
            &mut stdin,
            json!({
                "method": "thread/name/set",
                "id": 2,
                "params": { "threadId": thread_id.clone(), "name": title }
            }),
        )?;
        recv_response(&rx, 2, Instant::now() + Duration::from_secs(12))?;
        Ok(thread_id)
    })();

    let _ = child.kill();
    let _ = child.wait();
    result
}

fn precreate_session(agent: &str, cwd: &str, title: &str) -> Result<Option<String>, String> {
    let Some(bin) = agent_bin(agent) else {
        return Err(format!("Unknown agent: {agent}"));
    };
    let Some(bin_path) = resolve_bin(bin) else {
        return Err(format!(
            "Could not find the `{bin}` CLI on your PATH. Install it, then restart the app."
        ));
    };

    match agent {
        "cursor" => cursor_create_chat(&bin_path)
            .map(Some)
            .ok_or_else(|| "cursor-agent create-chat did not return a chat id.".to_string()),
        "codex" => codex_create_thread(&bin_path, cwd, title).map(Some),
        _ => Ok(None),
    }
}

fn required_session_id<'a>(
    agent: &str,
    agent_session_id: Option<&'a str>,
) -> Result<&'a str, String> {
    agent_session_id
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("{agent} requires a precreated session id."))
}

/// Per-agent plan: argv for new-vs-resume, plus how the id is acquired.
pub fn plan_spawn(
    agent: &str,
    mode: &str,
    agent_session_id: Option<&str>,
) -> Result<SpawnPlan, String> {
    let sid = agent_session_id.filter(|s| !s.is_empty());
    let resuming = mode == "resume" && sid.is_some();

    match agent {
        "claude" => {
            let sid = required_session_id(agent, sid)?;
            Ok(SpawnPlan {
                argv: if resuming {
                    vec!["--resume".into(), sid.into()]
                } else {
                    vec!["--session-id".into(), sid.into()]
                },
            })
        }
        // pi's `--session-id` creates the id if missing and reuses it when
        // present, so new and resume take the same flag (no `--resume` split
        // like claude). We own the id at birth (assign).
        "pi" => {
            let sid = required_session_id(agent, sid)?;
            Ok(SpawnPlan {
                argv: vec!["--session-id".into(), sid.into()],
            })
        }
        "cursor" => {
            let sid = required_session_id(agent, sid)?;
            Ok(SpawnPlan {
                argv: vec!["--resume".into(), sid.into()],
            })
        }
        "codex" => {
            if let Some(sid) = sid {
                Ok(SpawnPlan {
                    argv: vec!["resume".into(), sid.into()],
                })
            } else {
                Ok(SpawnPlan { argv: vec![] })
            }
        }
        // Fresh-only agents: no file discovery and no implicit "last session".
        "opencode" | "droid" => Ok(SpawnPlan { argv: vec![] }),
        _ => Ok(SpawnPlan { argv: vec![] }),
    }
}

#[tauri::command]
pub async fn agent_precreate_session(opts: SessionPrepareOptions) -> SessionPrepareResult {
    tauri::async_runtime::spawn_blocking(move || {
        match precreate_session(&opts.agent, &opts.cwd, &opts.title) {
            Ok(agent_session_id) => SessionPrepareResult::ok(agent_session_id),
            Err(error) => SessionPrepareResult::err(error),
        }
    })
    .await
    .unwrap_or_else(|_| SessionPrepareResult::err("precreate task failed"))
}
