use std::collections::HashMap;
use std::thread;

use crate::env::{capture_login_env, login_shell, resolve_bin, run_capture, shell_quote};
use crate::model::AgentInfo;

// --- Tool-adapter seam (port of electron/main/agents.ts) ---------------------
// Everything agent-CLI-specific: how each binary is located/versioned and how a
// resumable session id is acquired (assign / precreate / discover) and how the
// CLI is invoked fresh vs resume.

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

#[derive(Clone, Copy, PartialEq)]
pub enum IdWatch {
    None,
    Codex,
    Opencode,
    Droid,
}

pub struct SpawnPlan {
    /// Args after the binary (already unquoted).
    pub argv: Vec<String>,
    /// An id known now to persist immediately (precreate). None otherwise.
    pub emit_id: Option<String>,
    /// Discover agents: resolve the id once the CLI persists its first record.
    pub watch: IdWatch,
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

/// Per-agent plan: argv for new-vs-resume, plus how the id is acquired.
pub fn plan_spawn(
    agent: &str,
    mode: &str,
    agent_session_id: Option<&str>,
    bin_path: &str,
) -> SpawnPlan {
    let resuming = mode == "resume" && agent_session_id.map(|s| !s.is_empty()).unwrap_or(false);
    let sid = agent_session_id.unwrap_or("");

    match agent {
        "claude" => SpawnPlan {
            argv: if resuming {
                vec!["--resume".into(), sid.into()]
            } else {
                vec!["--session-id".into(), sid.into()]
            },
            emit_id: None,
            watch: IdWatch::None,
        },
        // pi's `--session-id` creates the id if missing and reuses it when
        // present, so new and resume take the same flag (no `--resume` split
        // like claude). We own the id at birth (assign).
        "pi" => SpawnPlan {
            argv: vec!["--session-id".into(), sid.into()],
            emit_id: None,
            watch: IdWatch::None,
        },
        "cursor" => {
            if resuming {
                SpawnPlan {
                    argv: vec!["--resume".into(), sid.into()],
                    emit_id: None,
                    watch: IdWatch::None,
                }
            } else {
                match cursor_create_chat(bin_path) {
                    Some(id) => SpawnPlan {
                        argv: vec!["--resume".into(), id.clone()],
                        emit_id: Some(id),
                        watch: IdWatch::None,
                    },
                    None => SpawnPlan {
                        argv: vec![],
                        emit_id: None,
                        watch: IdWatch::None,
                    },
                }
            }
        }
        "codex" => {
            if resuming {
                SpawnPlan {
                    argv: vec!["resume".into(), sid.into()],
                    emit_id: None,
                    watch: IdWatch::None,
                }
            } else {
                SpawnPlan {
                    argv: vec![],
                    emit_id: None,
                    watch: IdWatch::Codex,
                }
            }
        }
        "opencode" => {
            if resuming {
                SpawnPlan {
                    argv: vec!["-s".into(), sid.into()],
                    emit_id: None,
                    watch: IdWatch::None,
                }
            } else {
                SpawnPlan {
                    argv: vec![],
                    emit_id: None,
                    watch: IdWatch::Opencode,
                }
            }
        }
        // droid mints its id on first message (discover); a fresh launch runs bare
        // and we watch ~/.factory/sessions for the new record, resume via --resume.
        "droid" => {
            if resuming {
                SpawnPlan {
                    argv: vec!["--resume".into(), sid.into()],
                    emit_id: None,
                    watch: IdWatch::None,
                }
            } else {
                SpawnPlan {
                    argv: vec![],
                    emit_id: None,
                    watch: IdWatch::Droid,
                }
            }
        }
        _ => SpawnPlan {
            argv: vec![],
            emit_id: None,
            watch: IdWatch::None,
        },
    }
}
