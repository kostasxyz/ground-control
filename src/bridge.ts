import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { isAppThemeId } from '@shared/appThemes'
import type {
  AgentId,
  AgentInfo,
  DiffSource,
  GitDiffFileList,
  GitFileDiff,
  GitMutationResult,
  GitProjectInfo,
  GitStatus,
  GroundControlApi,
  PersistedState,
  Platform,
  SessionDataEvent,
  SessionExitEvent,
  SessionIdEvent,
  Settings,
  ShellSpawnOptions,
  SpawnOptions,
  SpawnResult
} from '@shared/types'
import type { AppThemeId } from '@shared/appThemes'
import type { TerminalBgCopyResult, TerminalBgDeleteResult } from '@shared/terminalBg'

// --- Tauri-backed implementation of the GroundControlApi contract ------------
// This replaces the Electron preload bridge. The renderer is unchanged: it sees
// the same `window.gc` surface. Request/response goes over `invoke`; PTY streams
// arrive as global Tauri events keyed by id (the renderer filters per-terminal).

// Platform, derived synchronously (the renderer reads it before first paint).
function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/Mac/i.test(ua)) return 'darwin'
  if (/Win/i.test(ua)) return 'win32'
  return 'linux'
}

// Pre-paint theme seed: persisted to localStorage on every save (below) so the
// next launch can read it synchronously, replacing the Electron preload's
// startupAppTheme without a native init script.
const THEME_KEY = 'gc:appTheme'
function readStartupTheme(): AppThemeId | null {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t && isAppThemeId(t) ? (t as AppThemeId) : null
  } catch {
    return null
  }
}

const startup = { platform: detectPlatform(), startupAppTheme: readStartupTheme() }

/** Subscribe to a global Tauri event, exposing the sync unsubscribe the
 *  contract expects (listen() is async; we unlisten once it resolves). */
function sub<T>(event: string, cb: (payload: T) => void): () => void {
  let un: UnlistenFn | null = null
  let cancelled = false
  void listen<T>(event, (e) => cb(e.payload)).then((u) => {
    if (cancelled) u()
    else un = u
  })
  return () => {
    cancelled = true
    if (un) un()
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// Port of persistedStateLoad.themeNeedsOsSeed — runs here so it can use the
// renderer's app-theme catalog. Reads raw (pre-normalization) settings.
function themeNeedsOsSeed(settings: Partial<Settings> & { theme?: unknown } | null | undefined): boolean {
  if (settings && isAppThemeId((settings as Settings).appThemeId)) return false
  const legacy = settings?.theme
  if (legacy === 'dark' || legacy === 'light' || legacy === 'ember') return false
  return true
}

const api: GroundControlApi = {
  session: {
    spawn: (opts: SpawnOptions) => invoke<SpawnResult>('session_spawn', { opts }),
    write: (id, data) => void invoke('session_write', { id, data }),
    resize: (id, cols, rows) => void invoke('session_resize', { id, cols, rows }),
    kill: (id) => void invoke('session_kill', { id }),
    onData: (cb) => sub<SessionDataEvent>('session-data', cb),
    onExit: (cb) => sub<SessionExitEvent>('session-exit', cb),
    onId: (cb) => sub<SessionIdEvent>('session-id', cb)
  },
  terminal: {
    spawn: (opts: ShellSpawnOptions) => invoke<SpawnResult>('terminal_spawn', { opts }),
    write: (id, data) => void invoke('terminal_write', { id, data }),
    resize: (id, cols, rows) => void invoke('terminal_resize', { id, cols, rows }),
    kill: (id) => void invoke('terminal_kill', { id }),
    onData: (cb) => sub<SessionDataEvent>('terminal-data', cb),
    onExit: (cb) => sub<SessionExitEvent>('terminal-exit', cb)
  },
  store: {
    load: async () => {
      const state = await invoke<PersistedState>('store_load')
      return { state, themeNeedsOsSeed: themeNeedsOsSeed(state?.settings) }
    },
    save: (state: PersistedState) => {
      // Mirror the chosen app theme into localStorage for next launch's seed.
      try {
        if (state?.settings?.appThemeId) localStorage.setItem(THEME_KEY, state.settings.appThemeId)
      } catch {
        /* ignore */
      }
      return invoke<void>('store_save', { state })
    }
  },
  dialog: {
    pickDirectory: () => invoke<string | null>('dialog_pick_directory'),
    confirmDelete: (name: string) => invoke<boolean>('dialog_confirm_delete', { name }),
    confirmTrashTerminal: (title: string) =>
      invoke<boolean>('dialog_confirm_trash_terminal', { title }),
    confirmTrashTerminals: (count: number) =>
      invoke<boolean>('dialog_confirm_trash_terminals', { count })
  },
  terminalBg: {
    copyUpload: (data, mimeType, originalName) =>
      invoke<TerminalBgCopyResult>('terminal_bg_copy_upload', {
        data: arrayBufferToBase64(data),
        mimeType,
        originalName
      }),
    deleteFile: (filename) =>
      invoke<TerminalBgDeleteResult>('terminal_bg_delete', { filename })
  },
  transcript: {
    deriveTitle: (agentSessionId: string) =>
      invoke<string | null>('transcript_derive_title', { agentSessionId }),
    exists: (agentSessionId: string) =>
      invoke<boolean>('transcript_conversation_exists', { agentSessionId })
  },
  git: {
    info: (projectPath: string) => invoke<GitProjectInfo>('git_info', { projectPath }),
    status: (worktreePath: string) => invoke<GitStatus>('git_status', { worktreePath }),
    checkout: (worktreePath: string, branch: string) =>
      invoke<GitMutationResult>('git_checkout', { worktreePath, branch }),
    addWorktree: (projectPath, name, baseBranch, worktreeDirectory) =>
      invoke<GitMutationResult>('git_worktree_add', {
        projectPath,
        name,
        baseBranch,
        worktreeDirectory
      }),
    removeWorktree: (projectPath, worktreePath, deleteBranch) =>
      invoke<GitMutationResult>('git_worktree_remove', {
        projectPath,
        worktreePath,
        deleteBranch
      }),
    diffFiles: (worktreePath: string, source: DiffSource) =>
      invoke<GitDiffFileList>('git_diff_files', { worktreePath, source }),
    fileDiff: (worktreePath: string, source: DiffSource, path: string, oldPath?: string) =>
      invoke<GitFileDiff>('git_file_diff', { worktreePath, source, path, oldPath })
  },
  system: {
    agents: () => invoke<Record<AgentId, AgentInfo>>('system_agents'),
    homeDir: () => invoke<string>('system_home_dir'),
    platform: startup.platform,
    startupAppTheme: startup.startupAppTheme
  }
}

window.gc = api
