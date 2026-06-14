use std::collections::HashMap;

use crate::model::{DiffHunk, DiffLine};

// Port of shared/diffParse.ts. Pure parsers for unified-diff text and git's
// -z name-status / numstat / porcelain output.

fn read_num(s: &str) -> Option<(u64, &str)> {
    let end = s.find(|c: char| !c.is_ascii_digit()).unwrap_or(s.len());
    if end == 0 {
        return None;
    }
    let n = s[..end].parse().ok()?;
    Some((n, &s[end..]))
}

/// Parse `@@ -a[,b] +c[,d] @@ header`. Returns (oldStart, oldCount, newStart,
/// newCount, header) or None.
fn parse_hunk_header(line: &str) -> Option<(u64, u64, u64, u64, String)> {
    let s = line.strip_prefix("@@")?;
    let s = s.trim_start();
    let s = s.strip_prefix('-')?;
    let (old_start, s) = read_num(s)?;
    let (old_count, s) = match s.strip_prefix(',') {
        Some(r) => read_num(r)?,
        None => (1, s),
    };
    let s = s.trim_start().strip_prefix('+')?;
    let (new_start, s) = read_num(s)?;
    let (new_count, s) = match s.strip_prefix(',') {
        Some(r) => read_num(r)?,
        None => (1, s),
    };
    let s = s.trim_start().strip_prefix("@@")?;
    Some((
        old_start,
        old_count,
        new_start,
        new_count,
        s.trim().to_string(),
    ))
}

fn is_hunk_header(line: &str) -> bool {
    parse_hunk_header(line).is_some()
}

pub fn parse_unified_diff(text: &str) -> Vec<DiffHunk> {
    if text.is_empty() || text.lines().any(|l| l.starts_with("Binary files ")) {
        return Vec::new();
    }

    let lines: Vec<&str> = text
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .collect();
    let mut hunks: Vec<DiffHunk> = Vec::new();

    let mut i = 0usize;
    while i < lines.len() {
        let Some((old_start, old_count, new_start, new_count, header)) =
            parse_hunk_header(lines[i])
        else {
            i += 1;
            continue;
        };

        let mut hunk = DiffHunk {
            old_start,
            old_count,
            new_start,
            new_count,
            header,
            lines: Vec::new(),
        };
        let mut old_line = old_start;
        let mut new_line = new_start;

        i += 1;
        while i < lines.len() {
            let content = lines[i];

            if content == "\\ No newline at end of file" {
                if let Some(last) = hunk.lines.last_mut() {
                    last.no_trailing_newline = true;
                }
                i += 1;
                continue;
            }

            // End-of-hunk: a new hunk header or a new file section.
            if is_hunk_header(content) || content.starts_with("diff --git ") {
                break;
            }
            if content.is_empty() {
                let mut j = i + 1;
                while j < lines.len() && lines[j].is_empty() {
                    j += 1;
                }
                if j >= lines.len() || is_hunk_header(lines[j]) {
                    break;
                }
                // Blank context line — fall through.
            }

            // Split off the first character by *char* (not byte) boundary — a
            // content line can start with a multibyte codepoint, and `&content[1..]`
            // would panic slicing mid-codepoint.
            let mut chars = content.chars();
            let prefix = chars.next();
            let rest = chars.as_str();

            match prefix {
                Some(' ') => {
                    hunk.lines.push(DiffLine {
                        kind: "context".into(),
                        old_line: Some(old_line),
                        new_line: Some(new_line),
                        text: rest.to_string(),
                        no_trailing_newline: false,
                    });
                    old_line += 1;
                    new_line += 1;
                }
                Some('+') => {
                    hunk.lines.push(DiffLine {
                        kind: "add".into(),
                        old_line: None,
                        new_line: Some(new_line),
                        text: rest.to_string(),
                        no_trailing_newline: false,
                    });
                    new_line += 1;
                }
                Some('-') => {
                    hunk.lines.push(DiffLine {
                        kind: "delete".into(),
                        old_line: Some(old_line),
                        new_line: None,
                        text: rest.to_string(),
                        no_trailing_newline: false,
                    });
                    old_line += 1;
                }
                _ => {
                    // Unrecognised prefix — treat as context (fallback).
                    hunk.lines.push(DiffLine {
                        kind: "context".into(),
                        old_line: Some(old_line),
                        new_line: Some(new_line),
                        text: content.to_string(),
                        no_trailing_newline: false,
                    });
                    old_line += 1;
                    new_line += 1;
                }
            }

            i += 1;
        }

        hunks.push(hunk);
    }

    hunks
}

fn map_status(letter: char) -> &'static str {
    match letter {
        'A' => "added",
        'M' | 'T' => "modified",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        _ => "modified",
    }
}

pub fn parse_untracked_from_porcelain(raw: &str) -> Vec<String> {
    raw.split('\0')
        .filter(|r| r.starts_with("?? "))
        .map(|r| r[3..].to_string())
        .collect()
}

pub struct NameStatus {
    pub status: String,
    pub old_path: Option<String>,
}

/// Ordered (path, status) pairs — insertion order matters for the file list.
pub fn parse_name_status_map(raw: &str) -> Vec<(String, NameStatus)> {
    let parts: Vec<&str> = raw.split('\0').collect();
    let mut out: Vec<(String, NameStatus)> = Vec::new();
    let mut i = 0usize;
    while i < parts.len() {
        if i >= parts.len() - 1 || parts[i].is_empty() {
            i += 1;
            continue;
        }
        let raw_status = parts[i];
        i += 1;
        let letter = raw_status.chars().next().unwrap_or('M');
        let status = map_status(letter).to_string();
        if letter == 'R' || letter == 'C' {
            let old_path = parts.get(i).copied().unwrap_or("");
            i += 1;
            let new_path = parts.get(i).copied().unwrap_or("");
            i += 1;
            if !new_path.is_empty() {
                out.push((
                    new_path.to_string(),
                    NameStatus {
                        status,
                        old_path: Some(old_path.to_string()),
                    },
                ));
            }
        } else {
            let path = parts.get(i).copied().unwrap_or("");
            i += 1;
            if !path.is_empty() {
                out.push((
                    path.to_string(),
                    NameStatus {
                        status,
                        old_path: None,
                    },
                ));
            }
        }
    }
    out
}

pub struct Numstat {
    pub insertions: u32,
    pub deletions: u32,
    pub binary: bool,
}

pub fn parse_numstat_map(raw: &str) -> HashMap<String, Numstat> {
    let records: Vec<&str> = raw.split('\0').collect();
    let mut map = HashMap::new();
    let mut i = 0usize;
    while i < records.len() {
        let head = records[i];
        i += 1;
        if head.is_empty() {
            continue;
        }
        let cols: Vec<&str> = head.split('\t').collect();
        let added = cols.first().copied().unwrap_or("");
        let deleted = cols.get(1).copied().unwrap_or("");
        let mut path = cols.get(2).copied().unwrap_or("").to_string();
        if path.is_empty() {
            // Rename/copy: <old>\0<new> follow as fields.
            i += 1; // skip old path
            path = records.get(i).copied().unwrap_or("").to_string();
            i += 1;
        }
        if path.is_empty() {
            continue;
        }
        let binary = added == "-" || deleted == "-";
        map.insert(
            path,
            Numstat {
                insertions: if binary {
                    0
                } else {
                    added.parse().unwrap_or(0)
                },
                deletions: if binary {
                    0
                } else {
                    deleted.parse().unwrap_or(0)
                },
                binary,
            },
        );
    }
    map
}
