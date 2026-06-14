use std::fs;
use std::path::PathBuf;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::{AppHandle, Manager};

use crate::model::{TerminalBgCopyResult, TerminalBgDeleteResult};

// Port of electron/main/terminalBg.ts + shared/terminalBg.ts. Managed terminal
// background images live under <appData>/terminal-bg and are served over the
// custom `groundcontrol://terminal-bg/<file>` scheme (registered in main.rs).

const DIR: &str = "terminal-bg";
const MAX_BYTES: usize = 5 * 1024 * 1024;

fn managed_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(DIR)
}

/// Managed filename only — reject path segments and traversal.
fn is_safe_filename(name: &str) -> bool {
    if name.is_empty() || name.len() > 200 {
        return false;
    }
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return false;
    }
    name.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

pub fn resolve_managed_path(app: &AppHandle, filename: &str) -> Option<PathBuf> {
    if !is_safe_filename(filename) {
        return None;
    }
    let dir = managed_dir(app);
    let path = dir.join(filename);
    // Defense in depth: ensure the join stayed inside the managed dir.
    if path.parent() != Some(dir.as_path()) {
        return None;
    }
    Some(path)
}

fn sniff_mime(data: &[u8]) -> Option<&'static str> {
    if data.len() >= 8 && data[..8] == [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] {
        return Some("image/png");
    }
    if data.len() >= 3 && data[..3] == [0xff, 0xd8, 0xff] {
        return Some("image/jpeg");
    }
    if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    None
}

fn ext_for_mime(mime: &str) -> Option<&'static str> {
    match mime {
        "image/png" => Some(".png"),
        "image/jpeg" => Some(".jpg"),
        "image/webp" => Some(".webp"),
        _ => None,
    }
}

fn mime_for_ext(ext: &str) -> Option<&'static str> {
    match ext.to_ascii_lowercase().as_str() {
        ".png" => Some("image/png"),
        ".jpg" | ".jpeg" => Some("image/jpeg"),
        ".webp" => Some("image/webp"),
        _ => None,
    }
}

/// Content-type for serving a managed file, by its extension.
pub fn content_type_for(filename: &str) -> &'static str {
    let ext = filename.rfind('.').map(|i| &filename[i..]).unwrap_or("");
    mime_for_ext(ext).unwrap_or("application/octet-stream")
}

#[tauri::command]
pub fn terminal_bg_copy_upload(
    app: AppHandle,
    data: String, // base64 (bridge encodes the ArrayBuffer)
    mime_type: String,
    original_name: String,
) -> TerminalBgCopyResult {
    let err = |m: &str| TerminalBgCopyResult::Err {
        ok: false,
        error: m.to_string(),
    };

    let bytes = match STANDARD.decode(data.as_bytes()) {
        Ok(b) => b,
        Err(_) => return err("Could not read the image."),
    };
    if bytes.len() > MAX_BYTES {
        return err("Image must be 5 MB or smaller.");
    }
    if ext_for_mime(&mime_type).is_none() {
        return err("Only PNG, JPEG, and WebP images are supported.");
    }
    let ext = original_name
        .rfind('.')
        .map(|i| original_name[i..].to_ascii_lowercase())
        .unwrap_or_default();
    let ext_mime = match mime_for_ext(&ext) {
        Some(m) => m,
        None => return err("Only PNG, JPEG, and WebP images are supported."),
    };
    if ext_mime != mime_type {
        return err("File type does not match its extension.");
    }
    match sniff_mime(&bytes) {
        Some(m) if m == mime_type => {}
        _ => return err("File content does not match its type."),
    }

    let dir = managed_dir(&app);
    if fs::create_dir_all(&dir).is_err() {
        return err("Could not store the image.");
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let rand: u32 = {
        // Cheap unique suffix; uniqueness is all we need here.
        let mut s = std::collections::hash_map::DefaultHasher::new();
        use std::hash::{Hash, Hasher};
        (now, std::process::id(), bytes.len()).hash(&mut s);
        (s.finish() & 0xffff_ffff) as u32
    };
    let filename = format!("bg-{now}-{rand:08x}{}", ext_for_mime(&mime_type).unwrap());
    let dest = match resolve_managed_path(&app, &filename) {
        Some(p) => p,
        None => return err("Could not store the image."),
    };
    match fs::write(&dest, &bytes) {
        Ok(_) => TerminalBgCopyResult::Ok { ok: true, filename },
        Err(_) => err("Could not store the image."),
    }
}

#[tauri::command]
pub fn terminal_bg_delete(app: AppHandle, filename: String) -> TerminalBgDeleteResult {
    let Some(path) = resolve_managed_path(&app, &filename) else {
        return TerminalBgDeleteResult::Err {
            ok: false,
            error: "Invalid filename.".into(),
        };
    };
    match fs::remove_file(&path) {
        Ok(_) => TerminalBgDeleteResult::Ok { ok: true },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            TerminalBgDeleteResult::Ok { ok: true }
        }
        Err(_) => TerminalBgDeleteResult::Err {
            ok: false,
            error: "Could not delete the image.".into(),
        },
    }
}
