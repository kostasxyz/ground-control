use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

use serde_json::Value;

// Port of electron/main/transcript.ts. The only place that knows Claude's
// on-disk transcript format: derive a session title from the first human turn
// in `~/.claude/projects/*/<uuid>.jsonl`.

fn projects_root() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into()))
        .join(".claude")
        .join("projects")
}

fn find_transcript(agent_session_id: &str) -> Option<PathBuf> {
    let wanted = format!("{agent_session_id}.jsonl");
    let entries = fs::read_dir(projects_root()).ok()?;
    for entry in entries.flatten() {
        let candidate = entry.path().join(&wanted);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn text_from_content(content: &Value) -> Option<String> {
    if let Some(s) = content.as_str() {
        return Some(s.to_string());
    }
    if let Some(arr) = content.as_array() {
        let parts: Vec<String> = arr
            .iter()
            .filter_map(|p| p.get("text").and_then(|t| t.as_str()).map(str::to_string))
            .filter(|s| !s.is_empty())
            .collect();
        if !parts.is_empty() {
            return Some(parts.join(" "));
        }
    }
    None
}

fn tidy(text: &str, max: usize) -> String {
    let one_line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.chars().count() > max {
        let truncated: String = one_line.chars().take(max - 1).collect();
        format!("{}…", truncated.trim_end())
    } else {
        one_line
    }
}

#[tauri::command]
pub fn transcript_derive_title(agent_session_id: String) -> Option<String> {
    let file = find_transcript(&agent_session_id)?;
    let handle = fs::File::open(&file).ok()?;
    for line in BufReader::new(handle).lines() {
        let Ok(line) = line else { continue };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(obj) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if obj.get("type").and_then(|v| v.as_str()) == Some("user")
            && obj
                .get("message")
                .and_then(|m| m.get("role"))
                .and_then(|v| v.as_str())
                == Some("user")
        {
            if let Some(content) = obj.get("message").and_then(|m| m.get("content")) {
                if let Some(text) = text_from_content(content) {
                    // Skip command/meta noise Claude sometimes records first.
                    if !text.starts_with('<') && !text.starts_with('/') {
                        return Some(tidy(&text, 72));
                    }
                }
            }
        }
    }
    None
}
