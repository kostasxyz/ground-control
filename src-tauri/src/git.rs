use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use crate::diffparse::{
    parse_name_status_map, parse_numstat_map, parse_unified_diff, parse_untracked_from_porcelain,
};
use crate::env::capture_login_env;
use crate::model::{
    DiffSource, GitDiffFile, GitDiffFileList, GitFileDiff, GitMutationResult, GitProjectInfo,
    GitStatus, GitWorktree,
};
use crate::paths::normalize_path_identity;

// Full port of electron/main/git.ts. git is authoritative in the backend; the
// renderer receives already-parsed results (reusing the diffparse port).

const GIT_TIMEOUT_MS: u64 = 10_000;
const GIT_MAX_BUFFER: usize = 1024 * 1024;
const FILE_DIFF_MAX_BUFFER: usize = 5 * 1024 * 1024;
const DEFAULT_WORKTREE_DIRECTORY: &str = "~/.groundcontrol/worktrees";

struct GitErr {
    stdout: String,
    stderr: String,
    code: i32,
    truncated: bool,
}

fn home() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/".into())
}

fn basename(p: &str) -> String {
    p.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(p)
        .to_string()
}

fn dirname(p: &str) -> String {
    let t = p.trim_end_matches('/');
    match t.rfind('/') {
        Some(0) => "/".into(),
        Some(i) => t[..i].to_string(),
        None => ".".into(),
    }
}

fn run_git(cwd: &str, args: &[&str], max_buffer: usize) -> Result<String, GitErr> {
    let env = capture_login_env();
    let mut full: Vec<&str> = vec!["-C", cwd];
    full.extend_from_slice(args);

    let child = Command::new("git")
        .args(&full)
        .envs(&env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let child = match child {
        Ok(c) => c,
        Err(e) => {
            return Err(GitErr {
                stdout: String::new(),
                stderr: e.to_string(),
                code: -1,
                truncated: false,
            })
        }
    };
    let pid = child.id();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });

    match rx.recv_timeout(Duration::from_millis(GIT_TIMEOUT_MS)) {
        Ok(Ok(out)) => {
            let mut stdout = String::from_utf8_lossy(&out.stdout).into_owned();
            let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
            let code = out.status.code().unwrap_or(-1);
            let truncated = stdout.len() > max_buffer;
            if truncated {
                stdout.truncate(max_buffer);
                return Err(GitErr {
                    stdout,
                    stderr,
                    code,
                    truncated: true,
                });
            }
            if code != 0 {
                return Err(GitErr {
                    stdout,
                    stderr,
                    code,
                    truncated: false,
                });
            }
            Ok(stdout)
        }
        Ok(Err(e)) => Err(GitErr {
            stdout: String::new(),
            stderr: e.to_string(),
            code: -1,
            truncated: false,
        }),
        Err(_) => {
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
            Err(GitErr {
                stdout: String::new(),
                stderr: format!("git timed out after {GIT_TIMEOUT_MS}ms"),
                code: -1,
                truncated: false,
            })
        }
    }
}

fn git_error_message(e: &GitErr) -> String {
    let s = e.stderr.trim();
    if !s.is_empty() {
        s.to_string()
    } else if !e.stdout.trim().is_empty() {
        e.stdout.trim().to_string()
    } else {
        format!("git exited with code {}", e.code)
    }
}

fn fallback_info(project_path: &str, error: Option<String>) -> GitProjectInfo {
    let normalized = normalize_path_identity(project_path);
    GitProjectInfo {
        is_repository: false,
        root: None,
        worktrees: vec![GitWorktree {
            path: normalized,
            label: "main".into(),
            branch: None,
            head: None,
            is_main: true,
            detached: false,
        }],
        branches: vec![],
        error,
    }
}

struct ParsedWorktree {
    path: String,
    head: Option<String>,
    branch: Option<String>,
    detached: bool,
}

fn parse_worktrees(raw: &str) -> Vec<ParsedWorktree> {
    let mut out: Vec<ParsedWorktree> = Vec::new();
    for line in raw.split(['\r', '\n']) {
        if line.is_empty() {
            continue;
        }
        if let Some(path) = line.strip_prefix("worktree ") {
            out.push(ParsedWorktree {
                path: path.to_string(),
                head: None,
                branch: None,
                detached: false,
            });
        } else if let Some(cur) = out.last_mut() {
            if let Some(head) = line.strip_prefix("HEAD ") {
                cur.head = Some(head.to_string());
            } else if let Some(branch) = line.strip_prefix("branch refs/heads/") {
                cur.branch = Some(branch.to_string());
            } else if line == "detached" {
                cur.detached = true;
            }
        }
    }
    out
}

fn parse_branches(raw: &str) -> Vec<String> {
    let mut v: Vec<String> = raw
        .split(['\r', '\n'])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    v.sort();
    v
}

fn to_git_worktree(wt: &ParsedWorktree, index: usize) -> GitWorktree {
    let path = normalize_path_identity(&wt.path);
    let label = if index == 0 {
        "main".to_string()
    } else {
        wt.branch
            .clone()
            .filter(|b| !b.is_empty())
            .unwrap_or_else(|| {
                let base = basename(&path);
                if base.is_empty() {
                    path.clone()
                } else {
                    base
                }
            })
    };
    GitWorktree {
        path,
        label,
        branch: wt.branch.clone(),
        head: wt.head.clone(),
        is_main: index == 0,
        detached: wt.detached,
    }
}

fn git_info_inner(path: &str) -> Result<GitProjectInfo, GitErr> {
    let root = run_git(path, &["rev-parse", "--show-toplevel"], GIT_MAX_BUFFER)?
        .trim()
        .to_string();
    let worktrees_raw = run_git(path, &["worktree", "list", "--porcelain"], GIT_MAX_BUFFER)?;
    let branches_raw = run_git(
        path,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
        GIT_MAX_BUFFER,
    )?;

    let parsed = parse_worktrees(&worktrees_raw);
    let parsed = if parsed.is_empty() {
        vec![ParsedWorktree {
            path: root.clone(),
            head: None,
            branch: None,
            detached: false,
        }]
    } else {
        parsed
    };
    let worktrees = parsed
        .iter()
        .enumerate()
        .map(|(i, w)| to_git_worktree(w, i))
        .collect();

    Ok(GitProjectInfo {
        is_repository: true,
        root: Some(normalize_path_identity(&root)),
        worktrees,
        branches: parse_branches(&branches_raw),
        error: None,
    })
}

#[tauri::command]
pub fn git_info(project_path: String) -> GitProjectInfo {
    if project_path.trim().is_empty() {
        return fallback_info(&project_path, Some("Missing project path".into()));
    }
    match git_info_inner(&project_path) {
        Ok(info) => info,
        Err(e) => {
            let msg = git_error_message(&e);
            if msg.to_lowercase().contains("not a git repository") {
                fallback_info(&project_path, None)
            } else {
                fallback_info(&project_path, Some(msg))
            }
        }
    }
}

fn sum_numstat(raw: &str) -> (u32, u32) {
    let mut insertions = 0u32;
    let mut deletions = 0u32;
    for line in raw.split(['\r', '\n']) {
        if line.trim().is_empty() {
            continue;
        }
        let mut cols = line.split('\t');
        let added = cols.next().unwrap_or("");
        let deleted = cols.next().unwrap_or("");
        if added != "-" {
            insertions = insertions.saturating_add(added.parse::<u32>().unwrap_or(0));
        }
        if deleted != "-" {
            deletions = deletions.saturating_add(deleted.parse::<u32>().unwrap_or(0));
        }
    }
    (insertions, deletions)
}

#[tauri::command]
pub fn git_status(worktree_path: String) -> GitStatus {
    let empty = |is_repo: bool| GitStatus {
        is_repository: is_repo,
        files_changed: 0,
        insertions: 0,
        deletions: 0,
    };
    if worktree_path.trim().is_empty() {
        return empty(false);
    }
    let status_out = match run_git(&worktree_path, &["status", "--porcelain"], GIT_MAX_BUFFER) {
        Ok(s) => s,
        Err(_) => return empty(false),
    };
    let files_changed = status_out
        .split(['\r', '\n'])
        .filter(|l| !l.trim().is_empty())
        .count() as u32;
    let numstat = match run_git(
        &worktree_path,
        &["diff", "--numstat", "HEAD"],
        GIT_MAX_BUFFER,
    ) {
        Ok(s) => s,
        // A truncated (very large) diff still carries partial numstat we can
        // sum — far better than reporting 0. Only fall back to --cached on a
        // genuine failure (e.g. unborn HEAD with no commits yet).
        Err(e) if e.truncated => e.stdout,
        Err(_) => run_git(
            &worktree_path,
            &["diff", "--numstat", "--cached"],
            GIT_MAX_BUFFER,
        )
        .unwrap_or_default(),
    };
    let (insertions, deletions) = sum_numstat(&numstat);
    GitStatus {
        is_repository: true,
        files_changed,
        insertions,
        deletions,
    }
}

#[tauri::command]
pub fn git_checkout(worktree_path: String, branch: String) -> GitMutationResult {
    let branch = branch.trim().to_string();
    if worktree_path.trim().is_empty() {
        return GitMutationResult {
            ok: false,
            info: None,
            error: Some("Missing worktree path".into()),
        };
    }
    if branch.is_empty() {
        return GitMutationResult {
            ok: false,
            info: None,
            error: Some("Missing branch name".into()),
        };
    }
    let info = git_info(worktree_path.clone());
    if !info.is_repository {
        let error = info.error.clone().or(Some("Not a git repository".into()));
        return GitMutationResult {
            ok: false,
            error,
            info: Some(info),
        };
    }
    if !info.branches.contains(&branch) {
        return GitMutationResult {
            ok: false,
            error: Some(format!("Unknown local branch: {branch}")),
            info: Some(info),
        };
    }
    match run_git(
        &worktree_path,
        &["switch", "--no-guess", &branch],
        GIT_MAX_BUFFER,
    ) {
        Ok(_) => GitMutationResult {
            ok: true,
            info: Some(git_info(worktree_path)),
            error: None,
        },
        Err(e) => GitMutationResult {
            ok: false,
            error: Some(git_error_message(&e)),
            info: Some(git_info(worktree_path)),
        },
    }
}

fn resolve_worktree_base_dir(worktree_directory: Option<&str>) -> String {
    let raw = worktree_directory
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_WORKTREE_DIRECTORY);
    if raw == "~" {
        home()
    } else if let Some(rest) = raw.strip_prefix("~/") {
        format!("{}/{}", home(), rest)
    } else {
        raw.to_string()
    }
}

#[tauri::command]
pub fn git_worktree_add(
    project_path: String,
    name: String,
    base_branch: String,
    worktree_directory: Option<String>,
) -> GitMutationResult {
    let worktree_name = name.trim().to_string();
    let base = base_branch.trim().to_string();
    if project_path.trim().is_empty() {
        return GitMutationResult {
            ok: false,
            info: None,
            error: Some("Missing project path".into()),
        };
    }
    if worktree_name.is_empty() {
        return GitMutationResult {
            ok: false,
            info: None,
            error: Some("Missing worktree name".into()),
        };
    }
    if base.is_empty() {
        return GitMutationResult {
            ok: false,
            info: None,
            error: Some("Missing base branch".into()),
        };
    }
    let info = git_info(project_path.clone());
    let Some(root) = info.root.clone() else {
        let error = info.error.clone().or(Some("Not a git repository".into()));
        return GitMutationResult {
            ok: false,
            error,
            info: Some(info),
        };
    };
    if !info.is_repository {
        let error = info.error.clone().or(Some("Not a git repository".into()));
        return GitMutationResult {
            ok: false,
            error,
            info: Some(info),
        };
    }
    if !info.branches.contains(&base) {
        return GitMutationResult {
            ok: false,
            error: Some(format!("Unknown local branch: {base}")),
            info: Some(info),
        };
    }
    if info.branches.contains(&worktree_name) {
        return GitMutationResult {
            ok: false,
            error: Some(format!("Branch \"{worktree_name}\" already exists")),
            info: Some(info),
        };
    }
    if run_git(
        &project_path,
        &["check-ref-format", "--branch", &worktree_name],
        GIT_MAX_BUFFER,
    )
    .is_err()
    {
        return GitMutationResult {
            ok: false,
            error: Some(format!("Invalid worktree name: {worktree_name}")),
            info: Some(info),
        };
    }

    let folder = worktree_name.replace('/', "-");
    let target = format!(
        "{}/{}/{}",
        resolve_worktree_base_dir(worktree_directory.as_deref()),
        basename(&root),
        folder
    );
    if std::fs::create_dir_all(dirname(&target)).is_err() {
        return GitMutationResult {
            ok: false,
            error: Some("Could not create worktree directory".into()),
            info: Some(git_info(project_path)),
        };
    }
    match run_git(
        &project_path,
        &["worktree", "add", "-b", &worktree_name, &target, &base],
        GIT_MAX_BUFFER,
    ) {
        Ok(_) => GitMutationResult {
            ok: true,
            info: Some(git_info(project_path)),
            error: None,
        },
        Err(e) => GitMutationResult {
            ok: false,
            error: Some(git_error_message(&e)),
            info: Some(git_info(project_path)),
        },
    }
}

#[tauri::command]
pub fn git_worktree_remove(
    project_path: String,
    worktree_path: String,
    delete_branch: Option<bool>,
) -> GitMutationResult {
    let safe_worktree = worktree_path.trim().to_string();
    if project_path.trim().is_empty() {
        return GitMutationResult {
            ok: false,
            info: None,
            error: Some("Missing project path".into()),
        };
    }
    if safe_worktree.is_empty() {
        return GitMutationResult {
            ok: false,
            info: None,
            error: Some("Missing worktree path".into()),
        };
    }
    let info = git_info(project_path.clone());
    if !info.is_repository {
        let error = info.error.clone().or(Some("Not a git repository".into()));
        return GitMutationResult {
            ok: false,
            error,
            info: Some(info),
        };
    }
    let normalized = normalize_path_identity(&safe_worktree);
    let Some(target) = info
        .worktrees
        .iter()
        .find(|w| w.path == normalized)
        .cloned()
    else {
        return GitMutationResult {
            ok: false,
            error: Some(format!("Unknown worktree: {normalized}")),
            info: Some(info),
        };
    };
    if target.is_main {
        return GitMutationResult {
            ok: false,
            error: Some("The main worktree cannot be deleted".into()),
            info: Some(info),
        };
    }
    if let Err(e) = run_git(
        &project_path,
        &["worktree", "remove", "--force", &target.path],
        GIT_MAX_BUFFER,
    ) {
        return GitMutationResult {
            ok: false,
            error: Some(git_error_message(&e)),
            info: Some(git_info(project_path)),
        };
    }
    if delete_branch == Some(true) {
        if let Some(branch) = &target.branch {
            if let Err(e) = run_git(&project_path, &["branch", "-D", branch], GIT_MAX_BUFFER) {
                return GitMutationResult {
                    ok: false,
                    error: Some(format!(
                        "Worktree deleted, but deleting branch \"{branch}\" failed: {}",
                        git_error_message(&e)
                    )),
                    info: Some(git_info(project_path)),
                };
            }
        }
    }
    GitMutationResult {
        ok: true,
        info: Some(git_info(project_path)),
        error: None,
    }
}

fn get_merge_base(root: &str, branch: &str) -> Result<String, GitErr> {
    if branch.starts_with('-') {
        return Err(GitErr {
            stdout: String::new(),
            stderr: format!("Invalid branch name: {branch}"),
            code: -1,
            truncated: false,
        });
    }
    Ok(
        run_git(root, &["merge-base", "HEAD", branch], GIT_MAX_BUFFER)?
            .trim()
            .to_string(),
    )
}

fn count_untracked_lines(root: &str, untracked: &str) -> (u32, bool) {
    // --no-index exits 1 when files differ — that's our success case.
    let parse = |s: &str| -> (u32, bool) {
        let cols: Vec<&str> = s.split('\t').collect();
        if cols.len() >= 3 && cols[0] != "-" && cols[1] != "-" {
            (cols[0].parse().unwrap_or(0), false)
        } else {
            (0, cols.first() == Some(&"-"))
        }
    };
    match run_git(
        root,
        &[
            "diff",
            "--no-index",
            "--numstat",
            "--",
            "/dev/null",
            untracked,
        ],
        GIT_MAX_BUFFER,
    ) {
        Ok(s) => parse(&s),
        Err(e) if e.code == 1 => parse(&e.stdout),
        Err(_) => (0, false),
    }
}

#[tauri::command]
pub fn git_diff_files(worktree_path: String, source: DiffSource) -> GitDiffFileList {
    if worktree_path.trim().is_empty() {
        return GitDiffFileList {
            files: vec![],
            error: Some("Missing worktree path".into()),
        };
    }
    let root = match run_git(
        &worktree_path,
        &["rev-parse", "--show-toplevel"],
        GIT_MAX_BUFFER,
    ) {
        Ok(s) => s.trim().to_string(),
        Err(_) => {
            return GitDiffFileList {
                files: vec![],
                error: Some("Not a git repository".into()),
            }
        }
    };

    let (name_status_raw, numstat_raw) = match &source {
        DiffSource::Working => {
            match (
                run_git(
                    &root,
                    &["diff", "--name-status", "-z", "HEAD"],
                    GIT_MAX_BUFFER,
                ),
                run_git(&root, &["diff", "--numstat", "-z", "HEAD"], GIT_MAX_BUFFER),
            ) {
                (Ok(a), Ok(b)) => (a, b),
                _ => {
                    // Unborn HEAD: fall back to --cached.
                    let a = run_git(
                        &root,
                        &["diff", "--name-status", "-z", "--cached"],
                        GIT_MAX_BUFFER,
                    )
                    .unwrap_or_default();
                    let b = run_git(
                        &root,
                        &["diff", "--numstat", "-z", "--cached"],
                        GIT_MAX_BUFFER,
                    )
                    .unwrap_or_default();
                    (a, b)
                }
            }
        }
        DiffSource::Branch { branch } => {
            let base = match get_merge_base(&root, branch) {
                Ok(b) => b,
                Err(e) => {
                    return GitDiffFileList {
                        files: vec![],
                        error: Some(git_error_message(&e)),
                    }
                }
            };
            let a = match run_git(
                &root,
                &["diff", "--name-status", "-z", &base],
                GIT_MAX_BUFFER,
            ) {
                Ok(s) => s,
                Err(e) => {
                    return GitDiffFileList {
                        files: vec![],
                        error: Some(git_error_message(&e)),
                    }
                }
            };
            let b = run_git(&root, &["diff", "--numstat", "-z", &base], GIT_MAX_BUFFER)
                .unwrap_or_default();
            (a, b)
        }
    };

    let name_status = parse_name_status_map(&name_status_raw);
    let numstat = parse_numstat_map(&numstat_raw);

    let mut files: Vec<GitDiffFile> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for (path, info) in &name_status {
        let counts = numstat.get(path);
        files.push(GitDiffFile {
            path: path.clone(),
            old_path: info.old_path.clone(),
            status: info.status.clone(),
            insertions: counts.map(|c| c.insertions).unwrap_or(0),
            deletions: counts.map(|c| c.deletions).unwrap_or(0),
            binary: counts.map(|c| c.binary).unwrap_or(false),
        });
        seen.insert(path.clone());
    }

    if matches!(source, DiffSource::Working) {
        let status_out = run_git(
            &root,
            &["status", "--porcelain", "-z", "--untracked-files=all"],
            GIT_MAX_BUFFER,
        )
        .unwrap_or_default();
        for untracked in parse_untracked_from_porcelain(&status_out) {
            if seen.contains(&untracked) {
                continue;
            }
            let (insertions, binary) = count_untracked_lines(&root, &untracked);
            files.push(GitDiffFile {
                path: untracked.clone(),
                old_path: None,
                status: "untracked".into(),
                insertions,
                deletions: 0,
                binary,
            });
            seen.insert(untracked);
        }
    }

    GitDiffFileList { files, error: None }
}

#[tauri::command]
pub fn git_file_diff(
    worktree_path: String,
    source: DiffSource,
    path: String,
    old_path: Option<String>,
) -> GitFileDiff {
    let too_large = || GitFileDiff {
        hunks: vec![],
        binary: false,
        too_large: true,
        error: None,
    };
    let err = |m: String| GitFileDiff {
        hunks: vec![],
        binary: false,
        too_large: false,
        error: Some(m),
    };

    if worktree_path.trim().is_empty() {
        return err("Missing worktree path".into());
    }
    if path.trim().is_empty() {
        return err("Missing file path".into());
    }
    let root = match run_git(
        &worktree_path,
        &["rev-parse", "--show-toplevel"],
        GIT_MAX_BUFFER,
    ) {
        Ok(s) => s.trim().to_string(),
        Err(_) => return err("Not a git repository".into()),
    };

    let lit_path = format!(":(literal){path}");

    let text = match &source {
        DiffSource::Working => {
            let status_check = run_git(
                &root,
                &["status", "--porcelain", "-z", "--", &path],
                GIT_MAX_BUFFER,
            )
            .unwrap_or_default();
            let untracked = parse_untracked_from_porcelain(&status_check);
            if untracked.contains(&path) {
                match run_git(
                    &root,
                    &["diff", "--no-index", "--", "/dev/null", &path],
                    FILE_DIFF_MAX_BUFFER,
                ) {
                    Ok(s) => s,
                    // Check truncation before code==1: a too-large --no-index
                    // diff exits 1 (files differ) *and* sets truncated, and the
                    // truncated body must not be served as a complete diff.
                    Err(e) if e.truncated => return too_large(),
                    Err(e) if e.code == 1 => e.stdout,
                    Err(e) => return err(git_error_message(&e)),
                }
            } else {
                match run_git(
                    &root,
                    &["diff", "HEAD", "--", &lit_path],
                    FILE_DIFF_MAX_BUFFER,
                ) {
                    Ok(s) => s,
                    // Surface an oversized diff instead of swallowing it into the
                    // unborn-HEAD --cached fallback below (which would show "No
                    // diff" for a 5MB+ unstaged file).
                    Err(e) if e.truncated => return too_large(),
                    Err(_) => match run_git(
                        &root,
                        &["diff", "--cached", "--", &lit_path],
                        FILE_DIFF_MAX_BUFFER,
                    ) {
                        Ok(s) => s,
                        Err(e) if e.truncated => return too_large(),
                        Err(e) => return err(git_error_message(&e)),
                    },
                }
            }
        }
        DiffSource::Branch { branch } => {
            let base = match get_merge_base(&root, branch) {
                Ok(b) => b,
                Err(e) => return err(git_error_message(&e)),
            };
            let old_lit = old_path.as_ref().map(|o| format!(":(literal){o}"));
            let mut args: Vec<&str> = vec!["diff", &base, "--"];
            if let Some(o) = &old_lit {
                args.push(o);
            }
            args.push(&lit_path);
            match run_git(&root, &args, FILE_DIFF_MAX_BUFFER) {
                Ok(s) => s,
                Err(e) if e.truncated => return too_large(),
                Err(e) => return err(git_error_message(&e)),
            }
        }
    };

    if text.lines().any(|l| l.starts_with("Binary files ")) {
        return GitFileDiff {
            hunks: vec![],
            binary: true,
            too_large: false,
            error: None,
        };
    }
    if text.len() > 500_000 {
        return too_large();
    }
    GitFileDiff {
        hunks: parse_unified_diff(&text),
        binary: false,
        too_large: false,
        error: None,
    }
}
