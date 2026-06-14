use serde::{Deserialize, Serialize};

// --- IPC payload types (mirror shared/types.ts) ------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnOptions {
    pub id: String,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
    pub agent: String,
    pub agent_session_id: Option<String>,
    pub mode: String, // "new" | "resume"
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellSpawnOptions {
    pub id: String,
    pub cwd: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct SpawnResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl SpawnResult {
    pub fn ok() -> Self {
        Self {
            ok: true,
            error: None,
        }
    }
    pub fn err(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            error: Some(msg.into()),
        }
    }
}

// Events main → renderer. Names: session-data / session-exit / session-id /
// terminal-data / terminal-exit (kebab; valid Tauri event identifiers).

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataEvent {
    pub id: String,
    pub data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitEvent {
    pub id: String,
    pub exit_code: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signal: Option<i32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdEvent {
    pub id: String,
    pub agent_session_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

// --- Git types (mirror shared/types.ts) --------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktree {
    pub path: String,
    pub label: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub is_main: bool,
    pub detached: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProjectInfo {
    pub is_repository: bool,
    pub root: Option<String>,
    pub worktrees: Vec<GitWorktree>,
    pub branches: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitMutationResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub info: Option<GitProjectInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repository: bool,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DiffSource {
    Working,
    Branch { branch: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffFile {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    pub status: String,
    pub insertions: u32,
    pub deletions: u32,
    pub binary: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitDiffFileList {
    pub files: Vec<GitDiffFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: String, // "context" | "add" | "delete"
    pub old_line: Option<u64>,
    pub new_line: Option<u64>,
    pub text: String,
    #[serde(skip_serializing_if = "is_false")]
    pub no_trailing_newline: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub old_start: u64,
    pub old_count: u64,
    pub new_start: u64,
    pub new_count: u64,
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDiff {
    pub hunks: Vec<DiffHunk>,
    pub binary: bool,
    pub too_large: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// terminalBg results (mirror shared/terminalBg.ts).
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum TerminalBgCopyResult {
    Ok { ok: bool, filename: String },
    Err { ok: bool, error: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum TerminalBgDeleteResult {
    Ok { ok: bool },
    Err { ok: bool, error: String },
}
