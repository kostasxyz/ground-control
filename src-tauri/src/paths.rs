use std::path::{Component, Path, PathBuf};

// Port of electron/main/pathIdentity.ts. Normalize a cwd/worktree path to a
// single absolute identity string: trim, expand ~, resolve relative, strip a
// trailing slash, and realpath when the target exists.

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into()))
}

fn cwd() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"))
}

fn lexical_clean(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in p.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

pub fn normalize_path_identity(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return cwd().to_string_lossy().into_owned();
    }

    let expanded: PathBuf = if trimmed == "~" {
        home()
    } else if let Some(rest) = trimmed.strip_prefix("~/") {
        home().join(rest)
    } else {
        let p = Path::new(trimmed);
        if p.is_absolute() {
            p.to_path_buf()
        } else {
            cwd().join(p)
        }
    };

    let cleaned = lexical_clean(&expanded);
    let mut s = cleaned.to_string_lossy().into_owned();
    if s.len() > 1 && s.ends_with('/') {
        s.pop();
    }

    let path = PathBuf::from(&s);
    if path.exists() {
        match std::fs::canonicalize(&path) {
            Ok(real) => real.to_string_lossy().into_owned(),
            Err(_) => s,
        }
    } else {
        s
    }
}
