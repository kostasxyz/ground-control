use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};

use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager};

use crate::paths::normalize_path_identity;

// Port of electron/main/store.ts + persistedStateLoad.ts. Hand-rolled atomic
// JSON store in the app data dir. Settings are passed through untouched — the
// renderer re-normalizes them (and computes themeNeedsOsSeed) on load.

const SCOPE_KEY_SEP: char = '\u{1e}';
static WRITE_SEQ: AtomicU64 = AtomicU64::new(0);
static WRITE_LOCK: Mutex<()> = Mutex::new(());

fn store_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    dir.join("groundcontrol.json")
}

fn str_field<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(|x| x.as_str())
}

fn has_scoped_identity(v: &Value) -> bool {
    let id = str_field(v, "id").map(|s| !s.is_empty()).unwrap_or(false);
    let pid = str_field(v, "projectId")
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    let cwd = str_field(v, "cwd")
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    id && pid && cwd
}

fn normalize_project(mut v: Value) -> Value {
    let path = normalize_path_identity(str_field(&v, "path").unwrap_or(""));
    let active = match v.get("activeWorktreePath") {
        Some(Value::String(s)) if !s.is_empty() => Value::String(normalize_path_identity(s)),
        Some(Value::String(s)) => Value::String(s.clone()),
        _ => Value::Null,
    };
    if let Some(obj) = v.as_object_mut() {
        obj.insert("path".into(), Value::String(path));
        obj.insert("activeWorktreePath".into(), active);
    }
    v
}

fn normalize_session(v: Value) -> Value {
    let agent = str_field(&v, "agent")
        .filter(|a| matches!(*a, "claude" | "pi" | "codex" | "opencode" | "cursor" | "droid"))
        .unwrap_or("claude");
    let agent_session_id = v
        .get("agentSessionId")
        .filter(|x| !x.is_null())
        .cloned()
        .or_else(|| v.get("claudeSessionId").filter(|x| !x.is_null()).cloned())
        .unwrap_or(Value::Null);
    let cwd = normalize_path_identity(str_field(&v, "cwd").unwrap_or(""));
    json!({
        "id": str_field(&v, "id").unwrap_or(""),
        "projectId": str_field(&v, "projectId").unwrap_or(""),
        "agent": agent,
        "agentSessionId": agent_session_id,
        "title": str_field(&v, "title").unwrap_or(""),
        "cwd": cwd,
        "status": str_field(&v, "status").unwrap_or("idle"),
        "started": v.get("started").and_then(|x| x.as_bool()).unwrap_or(false),
        "renamed": v.get("renamed").and_then(|x| x.as_bool()).unwrap_or(false),
        "archived": v.get("archived").and_then(|x| x.as_bool()).unwrap_or(false),
        "archivedAt": v.get("archivedAt").cloned().unwrap_or(Value::Null),
        "createdAt": v.get("createdAt").cloned().unwrap_or(json!(0)),
        "lastActiveAt": v.get("lastActiveAt").cloned().unwrap_or(json!(0)),
    })
}

fn normalize_shell_terminal(v: Value) -> Value {
    let cwd = normalize_path_identity(str_field(&v, "cwd").unwrap_or(""));
    let font_size = match v.get("fontSize") {
        Some(Value::Number(n)) => Value::Number(n.clone()),
        _ => Value::Null,
    };
    json!({
        "id": str_field(&v, "id").unwrap_or(""),
        "projectId": str_field(&v, "projectId").unwrap_or(""),
        "cwd": cwd,
        "title": str_field(&v, "title").unwrap_or("Terminal"),
        "visible": v.get("visible").and_then(|x| x.as_bool()).unwrap_or(true),
        "fontSize": font_size,
        "createdAt": v.get("createdAt").cloned().unwrap_or(json!(0)),
    })
}

fn arr(parsed: &Value, key: &str) -> Vec<Value> {
    parsed
        .get(key)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn normalize_state(parsed: &Value) -> Value {
    let saved_version = parsed.get("version").and_then(|v| v.as_i64()).unwrap_or(1);
    let projects: Vec<Value> = arr(parsed, "projects")
        .into_iter()
        .map(normalize_project)
        .collect();
    // Settings pass through for the renderer to normalize, but must be an object
    // (never null) — bootstrap reads persisted.settings.* before normalizing.
    let settings = match parsed.get("settings") {
        Some(Value::Object(o)) => Value::Object(o.clone()),
        _ => json!({}),
    };
    let active = parsed
        .get("activeProjectId")
        .cloned()
        .unwrap_or(Value::Null);
    // Drop a dangling active id (its project may be gone) so the renderer never
    // boots pointing at a project that isn't in the list.
    let active = match active.as_str() {
        Some(id)
            if projects
                .iter()
                .any(|p| p.get("id").and_then(|v| v.as_str()) == Some(id)) =>
        {
            active
        }
        _ => Value::Null,
    };

    if saved_version < 3 {
        return json!({
            "version": 3,
            "projects": projects,
            "sessions": [],
            "activeProjectId": active,
            "settings": settings,
            "shellTerminals": [],
            "shellTerminalSeq": {},
        });
    }

    let sessions: Vec<Value> = arr(parsed, "sessions")
        .into_iter()
        .filter(has_scoped_identity)
        .map(normalize_session)
        .collect();
    let shell_terminals: Vec<Value> = arr(parsed, "shellTerminals")
        .into_iter()
        .filter(has_scoped_identity)
        .map(normalize_shell_terminal)
        .collect();
    let seq: Map<String, Value> = parsed
        .get("shellTerminalSeq")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|(k, _)| k.contains(SCOPE_KEY_SEP))
        .collect();

    json!({
        "version": 3,
        "projects": projects,
        "sessions": sessions,
        "activeProjectId": active,
        "settings": settings,
        "shellTerminals": shell_terminals,
        "shellTerminalSeq": Value::Object(seq),
    })
}

fn write_state_to_path(target: &Path, state: &Value) -> std::io::Result<()> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let seq = WRITE_SEQ.fetch_add(1, Ordering::SeqCst);
    let tmp = target.with_extension(format!("{}.{}.tmp", std::process::id(), seq));
    fs::write(
        &tmp,
        serde_json::to_string_pretty(state).unwrap_or_else(|_| "{}".into()),
    )?;
    fs::rename(&tmp, target)?; // atomic replace on the same filesystem
    Ok(())
}

fn write_state(app: &AppHandle, state: &Value) -> std::io::Result<()> {
    write_state_to_path(&store_path(app), state)
}

fn save_state(app: &AppHandle, state: &Value) -> std::io::Result<()> {
    let _guard = WRITE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    write_state(app, state)
}

#[tauri::command]
pub fn store_load(app: AppHandle) -> Value {
    let raw = match fs::read_to_string(store_path(&app)) {
        Ok(r) => r,
        Err(_) => return default_state(),
    };
    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(p) => p,
        Err(_) => return default_state(),
    };
    let saved_version = parsed.get("version").and_then(|v| v.as_i64()).unwrap_or(1);
    let state = normalize_state(&parsed);
    // Commit an in-memory migration so the on-disk file matches what runs.
    if saved_version != 3 {
        let _ = save_state(&app, &state);
    }
    state
}

#[tauri::command]
pub fn store_save(app: AppHandle, state: Value) -> Result<(), String> {
    save_state(&app, &state).map_err(|e| e.to_string())
}

fn default_state() -> Value {
    json!({
        "version": 3,
        "projects": [],
        "sessions": [],
        "activeProjectId": Value::Null,
        "settings": {},
        "shellTerminals": [],
        "shellTerminalSeq": {},
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_store_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!(
                "gc-tauri-store-{}-{name}-{nanos}",
                std::process::id()
            ))
            .join("groundcontrol.json")
    }

    #[test]
    fn normalize_state_filters_invalid_scoped_records() {
        let seq_key = format!("p1{SCOPE_KEY_SEP}term-1");
        let input = json!({
            "version": 3,
            "projects": [{ "id": "p1", "path": "/tmp/project", "activeWorktreePath": "" }],
            "sessions": [
                {
                    "id": "s1",
                    "projectId": "p1",
                    "agent": "unknown",
                    "agentSessionId": "agent-1",
                    "title": "Session",
                    "cwd": "/tmp/project"
                },
                { "id": "missing-project", "projectId": "", "cwd": "/tmp/project" }
            ],
            "shellTerminals": [
                { "id": "term-1", "projectId": "p1", "cwd": "/tmp/project" },
                { "id": "blank-cwd", "projectId": "p1", "cwd": "   " }
            ],
            "shellTerminalSeq": {
                (seq_key.clone()): 2,
                "legacy": 9
            },
            "activeProjectId": "p1",
            "settings": { "appThemeId": "ayu-dark" }
        });

        let state = normalize_state(&input);

        let sessions = state["sessions"].as_array().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0]["agent"], "claude");
        assert_eq!(sessions[0]["agentSessionId"], "agent-1");

        let shell_terminals = state["shellTerminals"].as_array().unwrap();
        assert_eq!(shell_terminals.len(), 1);
        assert_eq!(shell_terminals[0]["title"], "Terminal");

        let seq = state["shellTerminalSeq"].as_object().unwrap();
        assert_eq!(seq.len(), 1);
        assert_eq!(seq.get(&seq_key).unwrap(), 2);
        assert_eq!(state["settings"]["appThemeId"], "ayu-dark");
    }

    #[test]
    fn write_state_to_path_replaces_existing_json() {
        let path = temp_store_path("replace");
        let root = path.parent().unwrap().to_path_buf();

        write_state_to_path(&path, &json!({ "version": 3, "projects": ["old"] })).unwrap();
        write_state_to_path(&path, &json!({ "version": 3, "projects": ["new"] })).unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        let saved: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(saved["projects"][0], "new");

        let _ = fs::remove_dir_all(root);
    }
}
