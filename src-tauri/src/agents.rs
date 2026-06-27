use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
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

fn available_local_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .map_err(|e| format!("Could not allocate an opencode server port: {e}"))
}

fn read_text_lines<R: Read + Send + 'static>(reader: R, tx: mpsc::Sender<Result<String, String>>) {
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let _ = tx.send(Ok(line));
                }
                Err(e) => {
                    let _ = tx.send(Err(e.to_string()));
                    return;
                }
            }
        }
    });
}

fn opencode_server_url(line: &str) -> Option<String> {
    if !line.contains("opencode server listening on") {
        return None;
    }
    let start = line.find("http://")?;
    line[start..]
        .split_whitespace()
        .next()
        .map(|url| url.trim_end_matches('\r').to_string())
        .filter(|url| !url.is_empty())
}

fn wait_for_opencode_server(
    child: &mut std::process::Child,
    rx: &mpsc::Receiver<Result<String, String>>,
    deadline: Instant,
) -> Result<String, String> {
    let mut output = Vec::new();
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| format!("Could not inspect opencode serve: {e}"))?
        {
            let detail = if output.is_empty() {
                String::new()
            } else {
                format!(" Output: {}", output.join(" "))
            };
            return Err(format!(
                "opencode serve exited before listening: {status}.{detail}"
            ));
        }

        let now = Instant::now();
        if now >= deadline {
            let detail = if output.is_empty() {
                String::new()
            } else {
                format!(" Last output: {}", output.join(" "))
            };
            return Err(format!("Timed out waiting for opencode serve.{detail}"));
        }

        let timeout = deadline
            .saturating_duration_since(now)
            .min(Duration::from_millis(100));
        match rx.recv_timeout(timeout) {
            Ok(Ok(line)) => {
                if let Some(url) = opencode_server_url(&line) {
                    return Ok(url);
                }
                if !line.trim().is_empty() {
                    output.push(line);
                }
            }
            Ok(Err(error)) => output.push(error),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err("opencode serve stopped before reporting its URL.".into());
            }
        }
    }
}

fn parse_http_url(url: &str) -> Result<(String, u16), String> {
    let authority = url
        .strip_prefix("http://")
        .ok_or_else(|| format!("Unsupported opencode server URL: {url}"))?
        .split('/')
        .next()
        .unwrap_or("");
    let (host, port) = authority
        .rsplit_once(':')
        .ok_or_else(|| format!("OpenCode server URL has no port: {url}"))?;
    let port = port
        .parse::<u16>()
        .map_err(|_| format!("OpenCode server URL has an invalid port: {url}"))?;
    Ok((host.to_string(), port))
}

fn post_json(url: &str, path: &str, body: Value, timeout: Duration) -> Result<Value, String> {
    let (host, port) = parse_http_url(url)?;
    let mut stream = TcpStream::connect((host.as_str(), port))
        .map_err(|e| format!("Could not connect to opencode server: {e}"))?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(timeout))
        .map_err(|e| e.to_string())?;

    let body = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Type: application/json\r\nAccept: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",
        body.len()
    );
    stream
        .write_all(request.as_bytes())
        .and_then(|_| stream.write_all(&body))
        .and_then(|_| stream.flush())
        .map_err(|e| format!("Could not write opencode request: {e}"))?;

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|e| format!("Could not read opencode response: {e}"))?;
    let header_end = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| "OpenCode server returned a malformed HTTP response.".to_string())?;
    let headers = String::from_utf8_lossy(&response[..header_end]);
    let status = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| "OpenCode server returned a response without a status code.".to_string())?;
    let response_body = &response[header_end + 4..];
    if !(200..300).contains(&status) {
        return Err(format!(
            "OpenCode session create failed with HTTP {status}: {}",
            String::from_utf8_lossy(response_body)
        ));
    }
    serde_json::from_slice::<Value>(response_body)
        .map_err(|e| format!("OpenCode server returned invalid JSON: {e}"))
}

fn valid_opencode_session_id(id: &str) -> bool {
    id.starts_with("ses_")
        && id.len() >= 8
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn opencode_create_session(bin_path: &str, cwd: &str, title: &str) -> Result<String, String> {
    let env = capture_login_env();
    let port = available_local_port()?;
    let mut child = Command::new(bin_path)
        .arg("serve")
        .arg("--hostname")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .current_dir(cwd)
        .envs(&env)
        .env_remove("OPENCODE_SERVER_PASSWORD")
        .env_remove("OPENCODE_SERVER_USERNAME")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start opencode serve: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not open opencode serve stdout.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Could not open opencode serve stderr.".to_string())?;
    let (tx, rx) = mpsc::channel();
    read_text_lines(stdout, tx.clone());
    read_text_lines(stderr, tx);

    let result = (|| {
        let url =
            wait_for_opencode_server(&mut child, &rx, Instant::now() + Duration::from_secs(12))?;
        let created = post_json(
            &url,
            "/session",
            json!({ "title": title }),
            Duration::from_secs(8),
        )?;
        let id = created
            .get("id")
            .or_else(|| created.pointer("/session/id"))
            .and_then(Value::as_str)
            .filter(|id| valid_opencode_session_id(id))
            .ok_or_else(|| "opencode server did not return a session id.".to_string())?;
        Ok(id.to_string())
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
        "opencode" => opencode_create_session(&bin_path, cwd, title).map(Some),
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
        "opencode" => {
            let sid = required_session_id(agent, sid)?;
            Ok(SpawnPlan {
                argv: vec!["--session".into(), sid.into()],
            })
        }
        // Fresh-only agents: no file discovery and no implicit "last session".
        "droid" => Ok(SpawnPlan { argv: vec![] }),
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
