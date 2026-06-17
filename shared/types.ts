// Domain + IPC contract shared across main, preload, and renderer.
// Keep this platform-neutral (no Node-only types) so it compiles in the
// renderer's DOM tsconfig as well as the main process Node tsconfig.

import type { AgentId } from './agents'

export type { AgentId }

export type Platform = 'darwin' | 'win32' | 'linux' | (string & {})

export type SessionStatus = 'pending' | 'running' | 'idle' | 'exited'

export interface Project {
  id: string
  path: string // selected directory; also the cwd fallback for its sessions
  name: string
  color?: string
  addedAt: number
  /** Selected git worktree path for new sessions. null/undefined → project.path. */
  activeWorktreePath?: string | null
  archived: boolean
  archivedAt: number | null
  /** Pinned projects appear in the thin icon rail on the project screen. */
  pinned?: boolean
}

export interface Session {
  id: string // app-local id (also the PTY key)
  projectId: string
  agent: AgentId // which CLI this session runs
  // The agent's own resumable session id. Known at birth for claude (we mint it)
  // and cursor (create-chat); null for codex/opencode until their CLI persists a
  // record on the first message, at which point we discover + backfill it.
  agentSessionId: string | null
  title: string
  /** Worktree/cwd captured when the session was created. */
  cwd: string
  status: SessionStatus
  started: boolean // has the session launched at least once (→ resume thereafter)
  renamed: boolean // user pinned the title → never auto-derive over it
  archived: boolean // hidden from the session list; restorable from an archive screen later
  archivedAt: number | null
  createdAt: number
  lastActiveAt: number
}

/**
 * A plain project shell in the footer dock (P007). Parallel to `Session` by
 * design (ADR-001): no agent, no resume, no status machine. The PTY is keyed
 * by `id` and lives exactly as long as its column is mounted (ADR-0008).
 */
export interface ShellTerminal {
  id: string // PTY key
  projectId: string
  /** Worktree/cwd pinned when the terminal was created. */
  cwd: string
  title: string // "Terminal N" until renamed
  visible: boolean // column rendered; hidden keeps the PTY alive (ADR-006)
  fontSize: number | null // per-terminal override; null → settings.terminalFontSize
  createdAt: number
}

export interface ShellSpawnOptions {
  id: string
  cwd: string
  cols: number
  rows: number
}

import type { BodyFontId, HeadingFontId, TerminalFontId } from './fonts'
import type { AppThemeId } from './appThemes'
import type { TerminalBgCopyResult, TerminalBgDeleteResult } from './terminalBg'
import type { TerminalThemeId } from './terminalThemes'

export type { BodyFontId, HeadingFontId, TerminalFontId }
export type { AppThemeId }
export type { TerminalThemeId }

export interface Settings {
  /** Named app theme (ADR-0018). Replaces the old ThemeMode field. */
  appThemeId: AppThemeId
  /** Named terminal palette — independent from app color scheme (plan 005). */
  terminalThemeId: TerminalThemeId
  /** Width (px) of the sessions pane in the main split. Optional for back-compat. */
  sessionsPaneWidth?: number
  uiHeadingFontFamily: HeadingFontId
  uiHeadingFontSize: number
  uiBodyFontFamily: BodyFontId
  uiBodyFontSize: number
  terminalFontFamily: TerminalFontId
  terminalFontSize: number
  /** Hex override; null → scheme default terminal background (PLAN §11). */
  terminalBackgroundColor: string | null
  /** Managed filename only; null → no image (PLAN §11). */
  terminalBackgroundImage: string | null
  /** 0–100; image layer opacity only (PLAN §11). */
  terminalBackgroundOpacity: number
  /** Base directory for managed git worktrees. */
  worktreeDirectory: string
  /** Project-terminals panel height as % of the content area (P007, ADR-004). */
  terminalPanelHeightPct: number
  /** Width (px) of the file list pane in the Git diff viewer. */
  gitDiffFileListWidth?: number
}

export interface PersistedState {
  version: 3
  projects: Project[]
  sessions: Session[]
  activeProjectId: string | null
  settings: Settings
  /** P007 — additive, normalized at load (ADR-004); absent in older files. */
  shellTerminals?: ShellTerminal[]
  /** Per-(projectId,cwd) "Terminal N" counter; key = worktreeScopeKey. */
  shellTerminalSeq?: Record<string, number>
}

export type SpawnMode = 'new' | 'resume'

export interface SpawnOptions {
  id: string // app session id — keys the PTY and routes data/exit events
  cwd: string
  cols: number
  rows: number
  agent: AgentId
  agentSessionId: string | null // null for discover agents on a fresh launch
  mode: SpawnMode
}

export interface SpawnResult {
  ok: boolean
  error?: string
}

export interface SessionDataEvent {
  id: string
  data: string
}

export interface SessionExitEvent {
  id: string
  exitCode: number
  signal?: number
}

// main → renderer once a discover/precreate agent's id becomes known post-spawn.
export interface SessionIdEvent {
  id: string // app session id
  agentSessionId: string
}

export interface AgentInfo {
  found: boolean
  path: string | null
  version: string | null
}

export interface GitWorktree {
  path: string
  label: string
  branch: string | null
  head: string | null
  isMain: boolean
  detached: boolean
}

export interface GitProjectInfo {
  isRepository: boolean
  root: string | null
  worktrees: GitWorktree[]
  branches: string[]
  error?: string
}

/** Result of a state-changing git command (checkout, worktree remove, …). */
export interface GitMutationResult {
  ok: boolean
  info?: GitProjectInfo
  error?: string
}

/** Working-tree diff summary for one worktree (the sessions-pane changes badge). */
export interface GitStatus {
  isRepository: boolean
  /** Entries reported by `git status --porcelain` (staged, unstaged, untracked). */
  filesChanged: number
  /** Added lines across tracked changes (working tree vs HEAD). */
  insertions: number
  /** Deleted lines across tracked changes (working tree vs HEAD). */
  deletions: number
}

// --- Git diff types (011-git-review-panel) ----------------------------------

export type DiffSource =
  | { kind: 'working' }
  | { kind: 'branch'; branch: string }

export type GitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'

export interface GitDiffFile {
  path: string
  oldPath?: string
  status: GitFileStatus
  insertions: number
  deletions: number
  binary: boolean
}

export interface GitDiffFileList {
  files: GitDiffFile[]
  error?: string
}

export interface DiffLine {
  kind: 'context' | 'add' | 'delete'
  oldLine: number | null
  newLine: number | null
  text: string
  noTrailingNewline?: boolean
}

export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  header: string
  lines: DiffLine[]
}

export interface GitFileDiff {
  hunks: DiffHunk[]
  binary: boolean
  tooLarge: boolean
  error?: string
}

// The typed bridge the preload exposes on `window.gc`.
export interface GroundControlApi {
  session: {
    spawn(opts: SpawnOptions): Promise<SpawnResult>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): void
    /** Subscribe to PTY output. Returns an unsubscribe fn. */
    onData(cb: (e: SessionDataEvent) => void): () => void
    /** Subscribe to PTY exit. Returns an unsubscribe fn. */
    onExit(cb: (e: SessionExitEvent) => void): () => void
    /** Subscribe to discovered/created agent session ids. Returns an unsubscribe fn. */
    onId(cb: (e: SessionIdEvent) => void): () => void
  }
  /** Plain project shells (P007) — mirrors `session` minus agent concerns. */
  terminal: {
    spawn(opts: ShellSpawnOptions): Promise<SpawnResult>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): void
    onData(cb: (e: SessionDataEvent) => void): () => void
    onExit(cb: (e: SessionExitEvent) => void): () => void
  }
  store: {
    load(): Promise<{ state: PersistedState; themeNeedsOsSeed: boolean }>
    save(state: PersistedState): Promise<void>
  }
  dialog: {
    pickDirectory(): Promise<string | null>
    confirmDelete(name: string): Promise<boolean>
    confirmTrashTerminal(title: string): Promise<boolean>
    confirmTrashTerminals(count: number): Promise<boolean>
  }
  terminalBg: {
    copyUpload(
      data: ArrayBuffer,
      mimeType: string,
      originalName: string
    ): Promise<TerminalBgCopyResult>
    deleteFile(filename: string): Promise<TerminalBgDeleteResult>
  }
  transcript: {
    /** Best-effort title from Claude's own jsonl (first user message). */
    deriveTitle(agentSessionId: string): Promise<string | null>
    /** Whether a resumable Claude transcript exists on disk for this id. */
    exists(agentSessionId: string): Promise<boolean>
  }
  git: {
    info(projectPath: string): Promise<GitProjectInfo>
    status(worktreePath: string): Promise<GitStatus>
    checkout(worktreePath: string, branch: string): Promise<GitMutationResult>
    addWorktree(
      projectPath: string,
      name: string,
      baseBranch: string,
      worktreeDirectory?: string
    ): Promise<GitMutationResult>
    removeWorktree(
      projectPath: string,
      worktreePath: string,
      deleteBranch?: boolean
    ): Promise<GitMutationResult>
    diffFiles(
      worktreePath: string,
      source: DiffSource
    ): Promise<GitDiffFileList>
    fileDiff(
      worktreePath: string,
      source: DiffSource,
      path: string,
      oldPath?: string
    ): Promise<GitFileDiff>
  }
  system: {
    /** Probe every known agent CLI (presence + version). */
    agents(): Promise<Record<AgentId, AgentInfo>>
    homeDir(): Promise<string>
    platform: Platform
    /** Persisted app theme resolved by the main process at launch, for the
     *  pre-paint seed. null when none was passed (validated against the catalog). */
    startupAppTheme: AppThemeId | null
  }
}
