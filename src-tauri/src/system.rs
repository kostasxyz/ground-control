use std::collections::HashMap;

use crate::model::AgentInfo;

// system.* bridge surface (port of the systemAgents / systemHomeDir handlers).

#[tauri::command]
pub async fn system_agents() -> HashMap<String, AgentInfo> {
    tauri::async_runtime::spawn_blocking(crate::agents::agent_infos)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub fn system_home_dir() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".into())
}
