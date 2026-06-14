use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// --- Discover-strategy id watchers (port of electron/main/discover.ts) -------
// codex and opencode mint their session id lazily, on the FIRST user message.
// We watch each tool's own store until a record whose cwd matches ours appears,
// then lift its id.

const MAX_WATCH_MS: u128 = 30 * 60 * 1000;
const POLL_MS: u64 = 400;

struct Candidate {
    id: String,
    cwd: Option<String>,
    t: u128, // created/modified ms — newest wins
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn mtime_ms(meta: &fs::Metadata) -> u128 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into()))
}

fn first_nonempty_line(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    for line in BufReader::new(file).lines() {
        let line = line.ok()?;
        if !line.trim().is_empty() {
            return Some(line);
        }
    }
    None
}

/// codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl; first line is a
/// session_meta record carrying payload.{id, cwd}. We walk the date tree and
/// gate on mtime (cheaper than computing local day-dirs).
fn codex_candidates(at: u128) -> Vec<Candidate> {
    let mut out = Vec::new();
    let root = home().join(".codex").join("sessions");
    // sessions/<year>/<month>/<day>/rollout-*.jsonl
    for year in read_dirs(&root) {
        for month in read_dirs(&year) {
            for day in read_dirs(&month) {
                let Ok(entries) = fs::read_dir(&day) else {
                    continue;
                };
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if !name.starts_with("rollout-") || !name.ends_with(".jsonl") {
                        continue;
                    }
                    let Ok(meta) = entry.metadata() else { continue };
                    let t = mtime_ms(&meta);
                    if t < at.saturating_sub(1000) {
                        continue;
                    }
                    let Some(head) = first_nonempty_line(&entry.path()) else {
                        continue;
                    };
                    let Ok(obj) = serde_json::from_str::<serde_json::Value>(&head) else {
                        continue;
                    };
                    if obj.get("type").and_then(|v| v.as_str()) == Some("session_meta") {
                        if let Some(id) = obj
                            .get("payload")
                            .and_then(|p| p.get("id"))
                            .and_then(|v| v.as_str())
                        {
                            let cwd = obj
                                .get("payload")
                                .and_then(|p| p.get("cwd"))
                                .and_then(|v| v.as_str())
                                .map(str::to_string);
                            out.push(Candidate {
                                id: id.to_string(),
                                cwd,
                                t,
                            });
                        }
                    }
                }
            }
        }
    }
    out
}

/// opencode: ~/.local/share/opencode/storage/session/<projectID>/ses_*.json with
/// { id, directory, time:{created} }.
fn opencode_candidates(at: u128) -> Vec<Candidate> {
    let mut out = Vec::new();
    let root = home()
        .join(".local")
        .join("share")
        .join("opencode")
        .join("storage")
        .join("session");
    for project in read_dirs(&root) {
        let Ok(entries) = fs::read_dir(&project) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.starts_with("ses_") || !name.ends_with(".json") {
                continue;
            }
            let Ok(text) = fs::read_to_string(entry.path()) else {
                continue;
            };
            let Ok(obj) = serde_json::from_str::<serde_json::Value>(&text) else {
                continue;
            };
            let created = obj
                .get("time")
                .and_then(|t| t.get("created"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u128;
            if let Some(id) = obj.get("id").and_then(|v| v.as_str()) {
                if created >= at.saturating_sub(1000) {
                    let cwd = obj
                        .get("directory")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    out.push(Candidate {
                        id: id.to_string(),
                        cwd,
                        t: created,
                    });
                }
            }
        }
    }
    out
}

fn read_dirs(path: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(path) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .collect()
}

#[derive(Clone, Copy)]
pub enum Tool {
    Codex,
    Opencode,
}

/// Poll the tool's store until a record whose cwd matches appears, or the PTY
/// dies / the watch times out. Returns the discovered agent session id.
pub fn watch(
    tool: Tool,
    cwd: &str,
    spawned_at: u128,
    is_alive: &dyn Fn() -> bool,
) -> Option<String> {
    let candidates = match tool {
        Tool::Codex => codex_candidates,
        Tool::Opencode => opencode_candidates,
    };
    while is_alive() && now_ms().saturating_sub(spawned_at) < MAX_WATCH_MS {
        let mut matches: Vec<Candidate> = candidates(spawned_at)
            .into_iter()
            .filter(|c| c.cwd.as_deref() == Some(cwd))
            .collect();
        matches.sort_by(|a, b| b.t.cmp(&a.t));
        if let Some(first) = matches.first() {
            return Some(first.id.clone());
        }
        std::thread::sleep(Duration::from_millis(POLL_MS));
    }
    None
}
