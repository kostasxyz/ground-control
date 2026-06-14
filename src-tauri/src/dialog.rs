use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::paths::normalize_path_identity;

// Port of the dialog.* handlers via tauri-plugin-dialog. Each runs the native
// dialog on a blocking worker (never the main thread) so the plugin can pump
// it on the UI thread without deadlocking.

#[tauri::command]
pub async fn dialog_pick_directory(app: AppHandle) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title("Add a project")
            .blocking_pick_folder()?;
        let path = picked.into_path().ok()?;
        Some(normalize_path_identity(&path.to_string_lossy()))
    })
    .await
    .ok()
    .flatten()
}

async fn confirm(
    app: AppHandle,
    title: &'static str,
    message: String,
    ok_label: &'static str,
) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title(title)
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                ok_label.to_string(),
                "Cancel".to_string(),
            ))
            .blocking_show()
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
pub async fn dialog_confirm_delete(app: AppHandle, name: String) -> bool {
    confirm(
        app,
        "Delete Project",
        format!("Delete \"{name}\" and all its sessions?\n\nThis action cannot be undone."),
        "Delete",
    )
    .await
}

#[tauri::command]
pub async fn dialog_confirm_trash_terminal(app: AppHandle, title: String) -> bool {
    confirm(
        app,
        "Trash Terminal",
        format!("Trash \"{title}\"?\n\nThe shell and anything running in it will be killed."),
        "Trash",
    )
    .await
}

#[tauri::command]
pub async fn dialog_confirm_trash_terminals(app: AppHandle, count: u32) -> bool {
    let label = if count == 1 { "terminal" } else { "terminals" };
    confirm(
        app,
        "Kill Terminals",
        format!("Kill {count} {label}?\n\nThe shells and anything running in them will be killed."),
        "Kill All",
    )
    .await
}
