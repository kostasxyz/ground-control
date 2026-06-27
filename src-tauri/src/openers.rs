//! Detect external applications that can open a directory (editors / IDEs) and
//! open/reveal the active project directory externally.
//!
//! Cross-platform-safe by construction: editor detection runs only on macOS
//! (Launch Services via `mdfind` on bundle ids); every other platform returns
//! an empty list. Both `open_dir_in_app` and `reveal_dir` route through Rust
//! commands so the renderer uses the shared `window.gc` contract instead of the
//! opener JS plugin. Mirrors the termit `openers.rs` module, with a
//! `reveal_dir` command added so reveal also stays inside the IPC contract.

use serde::Serialize;

/// An installed app that can open a directory.
#[derive(Clone, Serialize)]
pub struct Opener {
    /// Stable identifier (React keys / future icon mapping).
    id: String,
    /// Human-readable name shown in the menu.
    label: String,
    /// Application reference passed to the opener plugin (kept native-side).
    #[serde(skip_serializing)]
    app: String,
}

/// Curated editor/IDE candidates as `(id, label, macOS bundle identifier)`.
#[cfg(target_os = "macos")]
const MAC_EDITORS: &[(&str, &str, &str)] = &[
    ("vscode", "Visual Studio Code", "com.microsoft.VSCode"),
    (
        "vscode-insiders",
        "VS Code Insiders",
        "com.microsoft.VSCodeInsiders",
    ),
    ("cursor", "Cursor", "com.todesktop.230313mzl4w4u92"),
    ("windsurf", "Windsurf", "com.exafunction.windsurf"),
    ("zed", "Zed", "dev.zed.Zed"),
    ("sublime", "Sublime Text", "com.sublimetext.4"),
    ("xcode", "Xcode", "com.apple.dt.Xcode"),
    ("intellij", "IntelliJ IDEA", "com.jetbrains.intellij"),
    ("webstorm", "WebStorm", "com.jetbrains.WebStorm"),
    ("pycharm", "PyCharm", "com.jetbrains.pycharm"),
    (
        "androidstudio",
        "Android Studio",
        "com.google.android.studio",
    ),
    ("nova", "Nova", "com.panic.Nova"),
];

/// Resolve a bundle identifier to its installed `.app` path via Spotlight.
/// Returns `None` when the app is not installed (or Spotlight is unavailable).
#[cfg(target_os = "macos")]
fn app_path_for_bundle(bundle_id: &str) -> Option<String> {
    let output = std::process::Command::new("mdfind")
        .arg(format!("kMDItemCFBundleIdentifier == '{bundle_id}'"))
        .output()
        .ok()?;
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| line.ends_with(".app"))
        .map(str::to_string)
}

#[cfg(target_os = "macos")]
fn list_dir_openers() -> Vec<Opener> {
    MAC_EDITORS
        .iter()
        .filter_map(|(id, label, bundle_id)| {
            app_path_for_bundle(bundle_id).map(|app| Opener {
                id: (*id).to_string(),
                label: (*label).to_string(),
                app,
            })
        })
        .collect()
}

#[cfg(not(target_os = "macos"))]
fn list_dir_openers() -> Vec<Opener> {
    // TODO(cross-platform): probe `which code|cursor|zed|subl|...` on PATH.
    Vec::new()
}

/// Installed editors/IDEs that can open a directory (macOS-detected; `[]`
/// elsewhere).
#[tauri::command]
pub fn dir_openers() -> Vec<Opener> {
    list_dir_openers()
}

/// Open an existing directory in a detected editor/IDE. The renderer passes a
/// stable opener id, not an arbitrary application string.
#[tauri::command]
pub fn open_dir_in_app(dir: String, opener_id: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&dir);
    let metadata =
        std::fs::metadata(&path).map_err(|e| format!("directory does not exist: {dir}: {e}"))?;
    if !metadata.is_dir() {
        return Err(format!("path is not a directory: {dir}"));
    }

    let opener = list_dir_openers()
        .into_iter()
        .find(|opener| opener.id == opener_id)
        .ok_or_else(|| format!("unknown directory opener: {opener_id}"))?;

    tauri_plugin_opener::open_path(path, Some(opener.app)).map_err(|e| e.to_string())
}

/// Reveal a directory in the OS file browser (Finder / Explorer / …).
#[tauri::command]
pub fn reveal_dir(dir: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&dir);
    let metadata =
        std::fs::metadata(&path).map_err(|e| format!("directory does not exist: {dir}: {e}"))?;
    if !metadata.is_dir() {
        return Err(format!("path is not a directory: {dir}"));
    }
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())
}
