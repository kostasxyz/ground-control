// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agents;
mod dialog;
mod diffparse;
mod discover;
mod env;
mod git;
mod model;
mod paths;
mod pty;
mod store;
mod system;
mod terminalbg;
mod transcript;

use std::borrow::Cow;

use tauri::{Manager, RunEvent};

use pty::PtyManager;

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push((hi * 16 + lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(PtyManager::new())
        // Managed terminal background images over groundcontrol://terminal-bg/<file>.
        .register_uri_scheme_protocol("groundcontrol", |ctx, request| {
            let app = ctx.app_handle();
            let not_found = || {
                tauri::http::Response::builder()
                    .status(404)
                    .body(Cow::Owned(Vec::new()))
                    .unwrap()
            };
            let uri = request.uri();
            if uri.host() != Some("terminal-bg") {
                return not_found();
            }
            let filename = percent_decode(uri.path().trim_start_matches('/'));
            if filename.is_empty() {
                return not_found();
            }
            let Some(path) = terminalbg::resolve_managed_path(app, &filename) else {
                return not_found();
            };
            match std::fs::read(&path) {
                Ok(bytes) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", terminalbg::content_type_for(&filename))
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Cow::Owned(bytes))
                    .unwrap(),
                Err(_) => not_found(),
            }
        })
        .setup(|_app| {
            env::warm_env(); // capture login-shell env early so first spawn is fast
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::session_spawn,
            pty::session_write,
            pty::session_resize,
            pty::session_kill,
            pty::terminal_spawn,
            pty::terminal_write,
            pty::terminal_resize,
            pty::terminal_kill,
            store::store_load,
            store::store_save,
            dialog::dialog_pick_directory,
            dialog::dialog_confirm_delete,
            dialog::dialog_confirm_trash_terminal,
            dialog::dialog_confirm_trash_terminals,
            terminalbg::terminal_bg_copy_upload,
            terminalbg::terminal_bg_delete,
            transcript::transcript_derive_title,
            transcript::transcript_conversation_exists,
            git::git_info,
            git::git_status,
            git::git_checkout,
            git::git_worktree_add,
            git::git_worktree_remove,
            git::git_diff_files,
            git::git_file_diff,
            system::system_agents,
            system::system_home_dir,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                app.state::<PtyManager>().kill_all();
            }
        });
}
