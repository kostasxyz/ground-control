import { create } from 'zustand'
import type {
  AgentId,
  AgentInfo,
  GitProjectInfo,
  GitStatus,
  PersistedState,
  Project,
  Session,
  SessionStatus,
  Settings,
  ShellTerminal
} from '@shared/types'
import { normalizeSettings } from '@shared/settings'
import { uuid } from '@/lib/id'
import { appearanceChanged, applyAppearance } from '@/lib/applyAppearance'
import {
  agentFallbackTitle,
  MAX_LIVE_SESSIONS,
  MAX_SHELL_TERMINALS,
  PLACEHOLDER_TITLE,
  PROJECT_COLORS,
  SESSIONS_PANE_DEFAULT
} from '@/lib/constants'
import {
  addActivatedWorktree,
  cleanupProjectScopes,
  cleanupWorktreeScope,
  deactivateProjectScopes,
  missingScopedKeysFromGit,
  pruneActiveSessionForWorktree,
  resetShellTerminalSeqAfterTrash,
  resolveActiveSessionId,
  resolveFocusedShellId,
  retargetFocusedShellInWorktree,
  selectedWorktreeKey,
  setActiveSessionForWorktree,
  setFocusedShellForWorktree,
  shouldRunExternalCleanup,
  visibleTerminals,
  worktreeScopeKey,
  isWorktreeActivated,
  type CleanupSlices,
  type WorktreeScope
} from '@/state/worktreeScope'
import { appThemeTerminalPair, isTerminalPairInSync, pairedAppTheme } from '@shared/appThemes'
import { defaultTerminalThemeForScheme } from '@shared/terminalThemes'
import type { ColorScheme } from '@shared/theme'

// Held at module scope so the OS change listener is not garbage-collected
// (ADR-0018). Guarded against double-registration.
let _osDarkMql: MediaQueryList | null = null

function registerOsSchemeListener(): void {
  if (_osDarkMql) return
  _osDarkMql = window.matchMedia('(prefers-color-scheme: dark)')
  _osDarkMql.addEventListener('change', () => {
    const osScheme: ColorScheme = _osDarkMql!.matches ? 'dark' : 'light'
    const st = useStore.getState()
    const { appThemeId, terminalThemeId } = st.settings
    const paired = pairedAppTheme(appThemeId, osScheme)
    if (paired === appThemeId) return
    // Re-pair the terminal on an OS-driven flip: an in-sync terminal follows the
    // app theme's pair; an off-pair (customized) one falls back to the new
    // scheme's default. Drop the bg override only when the palette changes.
    const nextTerminal = isTerminalPairInSync(appThemeId, terminalThemeId)
      ? appThemeTerminalPair(paired)
      : defaultTerminalThemeForScheme(osScheme)
    st.patchSettings(
      nextTerminal === terminalThemeId
        ? { appThemeId: paired }
        : { appThemeId: paired, terminalThemeId: nextTerminal, terminalBackgroundColor: null }
    )
  })
}

type View = 'workspace' | 'settings' | 'welcome' | 'gitDiff'

/** A failed git mutation, shown in the error dialog until dismissed. */
export interface GitError {
  /** Dialog title, e.g. "Could not switch branch". */
  title: string
  /** Which command failed, e.g. "git switch failed". */
  message: string
  /** Raw git output for the scrollable block. */
  output: string
}

interface Store {
  ready: boolean
  /** Per-agent CLI presence + version, probed at boot. null until ready. */
  agents: Record<AgentId, AgentInfo> | null
  /** Which top-level surface fills the content slot. Not persisted (boots to workspace). */
  view: View
  projects: Project[]
  sessions: Session[]
  activeProjectId: string | null
  /** Last selected agent session per normalized worktree key. Runtime-only. */
  activeSessionByWorktree: Record<string, string | undefined>
  /** Derived from activeSessionByWorktree for the current worktree. */
  activeSessionId: string | null
  /** Whether the "new session" agent picker is open. */
  newSessionOpen: boolean
  /** Session id pending archive confirmation, or null. Runtime-only. */
  sessionToArchive: string | null
  /** Sessions with a mounted terminal + live PTY (LRU order, front = newest). */
  liveIds: string[]
  /** Whether the project-terminals panel is expanded. Runtime-only (boots collapsed, P007). */
  terminalPanelOpen: boolean
  /** Plain project shells in the footer dock (P007, parallel to sessions — ADR-001). */
  shellTerminals: ShellTerminal[]
  /** Per-worktree "Terminal N" counter; reset when a worktree drops to 0/1 shells. */
  shellTerminalSeq: Record<string, number>
  /** Last focused shell terminal per normalized worktree key. Runtime-only. */
  focusedShellTerminalByWorktree: Record<string, string | undefined>
  /** Derived from focusedShellTerminalByWorktree for the current worktree. */
  focusedShellTerminalId: string | null
  /** Bumped on every explicit focus action so re-clicking a tab refocuses the
   *  xterm even when the focused id didn't change. */
  shellFocusSeq: number
  /** Shells whose PTY is gone, by cause — `exited` (user typed `exit`) or
   *  `spawn-failed` (never started). Runtime-only — restored terminals always
   *  respawn fresh (P007 T0006). */
  shellExited: Record<string, 'exited' | 'spawn-failed' | undefined>
  /** Worktrees activated this run: their shell columns are mounted (PTYs live)
   *  and stay mounted across worktree/project switches (ADR-005). Runtime-only. */
  activatedWorktrees: WorktreeScope[]
  /** Spawn errors keyed by session id (e.g. agent CLI not found). */
  errors: Record<string, string | undefined>
  homeDir: string | null
  settings: Settings
  git: Record<string, GitProjectInfo | undefined>
  gitLoading: Record<string, boolean | undefined>
  gitErrors: Record<string, GitError | undefined>
  /** Working-tree diff summary for each project's selected worktree. */
  gitStatus: Record<string, GitStatus | undefined>

  bootstrap(): Promise<void>
  setView(view: View): void
  setTerminalPanelOpen(open: boolean): void
  newShellTerminal(): void
  trashShellTerminal(id: string): Promise<void>
  trashProjectShellTerminals(): Promise<void>
  focusShellTerminal(id: string): void
  hideShellTerminal(id: string): void
  renameShellTerminal(id: string, title: string): void
  setShellTerminalFontSize(id: string, fontSize: number | null): void
  markShellTerminalExited(id: string, reason?: 'exited' | 'spawn-failed'): void
  clearShellTerminalExited(id: string): void
  patchSettings(partial: Partial<Settings>): void
  refreshGit(projectId: string): Promise<void>
  refreshGitStatus(projectId: string): Promise<void>
  selectWorktree(projectId: string, worktreePath: string): void
  checkoutBranch(projectId: string, branch: string): Promise<void>
  addWorktree(projectId: string, name: string, baseBranch: string): Promise<void>
  removeWorktree(projectId: string, worktreePath: string, deleteBranch?: boolean): Promise<void>
  clearGitError(projectId: string): void
  addProject(): Promise<void>
  clearActiveProject(): void
  archiveProject(id: string): void
  deleteProject(id: string): Promise<void>
  selectProject(id: string): void
  openNewSession(): void
  closeNewSession(): void
  newSession(agent: AgentId): void
  selectSession(id: string): void
  requestArchiveSession(id: string): void
  cancelArchiveSession(): void
  archiveSession(id: string): void
  markStarted(id: string): void
  markRunning(id: string): void
  markExited(id: string): void
  setError(id: string, message: string): void
  setAgentSessionId(id: string, agentSessionId: string): void
  renameSession(id: string, title: string): void
  refreshTitle(id: string): Promise<void>
}

// --- persistence (debounced) -------------------------------------------------
let saveTimer: ReturnType<typeof setTimeout> | null = null
function persist(get: () => Store): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const s = get()
    const state: PersistedState = {
      version: 3,
      projects: s.projects,
      // Runtime liveness is never persisted (PLAN §6): demote running → idle.
      sessions: s.sessions.map((se) =>
        se.status === 'running' || se.status === 'pending'
          ? { ...se, status: 'idle' as SessionStatus }
          : se
      ),
      activeProjectId: s.activeProjectId,
      settings: s.settings,
      shellTerminals: s.shellTerminals,
      shellTerminalSeq: s.shellTerminalSeq
    }
    void window.gc.store.save(state)
  }, 250)
}

/** Build a GitError for the error dialog from a failed mutation result. */
function gitError(title: string, message: string, output: string | undefined): GitError {
  return { title, message, output: output?.trim() || 'Unknown error' }
}

/** Add `id` to the live set (mounts its terminal), bump LRU, evict the tail. */
function withLive(s: Store, id: string): Partial<Store> {
  const ordered = [id, ...s.liveIds.filter((x) => x !== id)]
  const keep = ordered.slice(0, MAX_LIVE_SESSIONS)
  const evicted = new Set(ordered.slice(MAX_LIVE_SESSIONS))
  const sessions = evicted.size
    ? s.sessions.map((se) =>
        // Eviction unmounts the terminal and kills the PTY, so any non-exited
        // session — running *or* still-pending — falls back to idle; otherwise a
        // pending one evicted before it started would display pending forever.
        evicted.has(se.id) && (se.status === 'running' || se.status === 'pending')
          ? { ...se, status: 'idle' as SessionStatus }
          : se
      )
    : s.sessions
  return { liveIds: keep, sessions }
}

function cleanupSlicesFromStore(s: Store): CleanupSlices {
  return {
    sessions: s.sessions,
    liveIds: s.liveIds,
    errors: s.errors,
    shellTerminals: s.shellTerminals,
    shellExited: s.shellExited,
    shellTerminalSeq: s.shellTerminalSeq,
    activatedWorktrees: s.activatedWorktrees,
    activeSessionByWorktree: s.activeSessionByWorktree,
    focusedShellTerminalByWorktree: s.focusedShellTerminalByWorktree
  }
}

function worktreePointers(
  s: Pick<
    Store,
    | 'activeSessionByWorktree'
    | 'focusedShellTerminalByWorktree'
    | 'sessions'
    | 'shellTerminals'
  >,
  project: Project | null | undefined
): Pick<Store, 'activeSessionId' | 'focusedShellTerminalId'> {
  if (!project) return { activeSessionId: null, focusedShellTerminalId: null }
  const key = selectedWorktreeKey(project)
  return {
    activeSessionId: resolveActiveSessionId(
      s.activeSessionByWorktree,
      s.sessions,
      project.id,
      key
    ),
    focusedShellTerminalId: resolveFocusedShellId(
      s.focusedShellTerminalByWorktree,
      s.shellTerminals,
      project.id,
      key
    )
  }
}

export const useStore = create<Store>((set, get) => ({
  ready: false,
  agents: null,
  view: 'workspace',
  projects: [],
  sessions: [],
  activeProjectId: null,
  activeSessionByWorktree: {},
  activeSessionId: null,
  newSessionOpen: false,
  sessionToArchive: null,
  liveIds: [],
  terminalPanelOpen: false,
  shellTerminals: [],
  shellTerminalSeq: {},
  focusedShellTerminalByWorktree: {},
  focusedShellTerminalId: null,
  shellFocusSeq: 0,
  shellExited: {},
  activatedWorktrees: [],
  errors: {},
  homeDir: null,
  settings: normalizeSettings(undefined),
  git: {},
  gitLoading: {},
  gitErrors: {},
  gitStatus: {},

  async bootstrap() {
    registerOsSchemeListener()
    // Discover/precreate agents learn their session id post-spawn; persist it.
    window.gc.session.onId((e) => get().setAgentSessionId(e.id, e.agentSessionId))
    const [{ state: persisted, themeNeedsOsSeed }, agents, homeDir] = await Promise.all([
      window.gc.store.load(),
      window.gc.system.agents(),
      window.gc.system.homeDir()
    ])

    const projects = persisted.projects.map((p) => ({
      ...p,
      archived: p.archived ?? false,
      archivedAt: p.archivedAt ?? null,
      activeWorktreePath: p.activeWorktreePath ?? null
    }))
    const sessions = persisted.sessions.map((s) => ({
      ...s,
      archived: s.archived ?? false,
      archivedAt: s.archivedAt ?? null,
      status:
        s.status === 'running' || s.status === 'pending'
          ? ('idle' as SessionStatus)
          : s.status
    }))
    const shellTerminals = (persisted.shellTerminals ?? []).map((t) => ({
      ...t,
      visible: t.visible ?? true,
      fontSize: t.fontSize ?? null
    }))
    const settings = normalizeSettings({
      ...persisted.settings,
      sessionsPaneWidth:
        persisted.settings.sessionsPaneWidth ?? SESSIONS_PANE_DEFAULT
    })

    // Always boot to the project-select (welcome) screen with no active
    // project — the user chooses where to land each run.
    set({
      ready: true,
      agents,
      homeDir,
      projects,
      sessions,
      activeProjectId: null,
      activeSessionByWorktree: {},
      activeSessionId: null,
      view: 'welcome',
      // P007: tab records + counters restore; PTYs re-spawn lazily when each
      // project is first activated this run (ADR-004/005).
      shellTerminals,
      shellTerminalSeq: persisted.shellTerminalSeq ?? {},
      settings
    })
    applyAppearance(get().settings)

    // First-open / system-migrator: seed from OS appearance once.
    // Persist unconditionally so a concrete appThemeId lands on disk and
    // themeNeedsOsSeed is false on every subsequent launch.
    if (themeNeedsOsSeed) {
      const osScheme: ColorScheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      const { appThemeId, terminalThemeId } = get().settings
      const paired = pairedAppTheme(appThemeId, osScheme)
      if (paired !== appThemeId) {
        // Keep an in-sync terminal paired to the seeded app theme; leave a
        // customized (off-pair) terminal as the user had it.
        const nextTerminal = isTerminalPairInSync(appThemeId, terminalThemeId)
          ? appThemeTerminalPair(paired)
          : terminalThemeId
        get().patchSettings(
          nextTerminal === terminalThemeId
            ? { appThemeId: paired }
            : { appThemeId: paired, terminalThemeId: nextTerminal, terminalBackgroundColor: null }
        )
      } else {
        // Persist the current (default) id so the flag is false next launch.
        get().patchSettings({ appThemeId })
      }
    }
  },

  patchSettings(partial) {
    const prev = get().settings
    const settings = normalizeSettings({ ...prev, ...partial })
    set({ settings })
    if (appearanceChanged(prev, settings)) applyAppearance(settings)
    persist(get)
  },

  async refreshGit(projectId) {
    const project = get().projects.find((candidate) => candidate.id === projectId)
    if (!project) return
    // Errors are not cleared here: refreshGit also runs on window focus, which
    // must not dismiss an open error dialog behind the user's back.
    set((state) => ({
      gitLoading: { ...state.gitLoading, [projectId]: true }
    }))
    const info = await window.gc.git.info(project.path)
    let shouldPersist = false
    set((state) => {
      const currentProject = state.projects.find((candidate) => candidate.id === projectId)
      let slices = cleanupSlicesFromStore(state)
      let projects = state.projects

      // Selection repair needs trustworthy worktree data: a successful repo
      // read or the definitive non-repo fallback. Transient git failures set
      // info.error and must not move the selection (or it could never heal a
      // selection left pointing at a deleted worktree).
      if (!info.error && currentProject) {
        const defaultWorktreePath =
          info.worktrees.find((worktree) => worktree.path === currentProject.path)?.path ??
          info.worktrees[0]?.path ??
          currentProject.path
        const currentWorktreePath = currentProject.activeWorktreePath
        const hasCurrentWorktree = info.worktrees.some(
          (worktree) => worktree.path === currentWorktreePath
        )
        const nextWorktreePath = hasCurrentWorktree
          ? (currentWorktreePath ?? defaultWorktreePath)
          : defaultWorktreePath
        const worktreePathChanged = currentWorktreePath !== nextWorktreePath

        projects = state.projects.map((candidate) =>
          candidate.id === projectId
            ? { ...candidate, activeWorktreePath: nextWorktreePath }
            : candidate
        )

        // Destructive record cleanup additionally requires a real repository
        // read (ADR-009-04): non-repo fallbacks must never prune records.
        let missingKeys: string[] = []
        if (shouldRunExternalCleanup(info)) {
          missingKeys = missingScopedKeysFromGit(
            slices.sessions,
            slices.shellTerminals,
            slices.activatedWorktrees,
            projectId,
            info,
            currentProject.path
          )
          for (const key of missingKeys) {
            slices = cleanupWorktreeScope(slices, projectId, key)
          }
        }

        // A repaired selection must mount its shell columns the way
        // selectWorktree does, or persisted tabs render without PTYs.
        if (worktreePathChanged && state.activeProjectId === projectId) {
          slices = {
            ...slices,
            activatedWorktrees: addActivatedWorktree(
              slices.activatedWorktrees,
              projectId,
              nextWorktreePath
            )
          }
        }

        shouldPersist = worktreePathChanged || missingKeys.length > 0
      }

      const updatedProject = projects.find((candidate) => candidate.id === projectId)
      return {
        ...slices,
        projects,
        git: { ...state.git, [projectId]: info },
        gitLoading: { ...state.gitLoading, [projectId]: false },
        // Global pointers belong to the active project: a slow refresh that
        // lands after a project switch must not repoint them cross-project.
        ...(state.activeProjectId === projectId
          ? worktreePointers(slices, updatedProject)
          : {})
      }
    })
    if (shouldPersist) persist(get)
    void get().refreshGitStatus(projectId)
  },

  async refreshGitStatus(projectId) {
    const project = get().projects.find((candidate) => candidate.id === projectId)
    if (!project) return
    const key = selectedWorktreeKey(project)
    const status = await window.gc.git.status(key)
    // Drop a stale result: if the project's selected worktree changed while this
    // status was in flight, a newer refresh owns the badge — writing here would
    // show the previous worktree's dirty state.
    const current = get().projects.find((candidate) => candidate.id === projectId)
    if (!current || selectedWorktreeKey(current) !== key) return
    set((state) => ({ gitStatus: { ...state.gitStatus, [projectId]: status } }))
  },

  selectWorktree(projectId, worktreePath) {
    const project = get().projects.find((candidate) => candidate.id === projectId)
    if (!project) return
    const alreadySelected = project.activeWorktreePath === worktreePath
    if (
      alreadySelected &&
      isWorktreeActivated(get().activatedWorktrees, projectId, worktreePath)
    ) {
      return
    }
    set((state) => {
      const projects = alreadySelected
        ? state.projects
        : state.projects.map((candidate) =>
            candidate.id === projectId
              ? { ...candidate, activeWorktreePath: worktreePath }
              : candidate
          )
      const updatedProject = projects.find((candidate) => candidate.id === projectId)
      return {
        projects,
        activatedWorktrees: addActivatedWorktree(
          state.activatedWorktrees,
          projectId,
          worktreePath
        ),
        ...worktreePointers(state, updatedProject)
      }
    })
    if (!alreadySelected) persist(get)
    void get().refreshGitStatus(projectId)
  },

  async checkoutBranch(projectId, branch) {
    const project = get().projects.find((candidate) => candidate.id === projectId)
    if (!project) return
    const worktreePath = selectedWorktreeKey(project)
    set((state) => ({
      gitLoading: { ...state.gitLoading, [projectId]: true },
      gitErrors: { ...state.gitErrors, [projectId]: undefined }
    }))
    const result = await window.gc.git.checkout(worktreePath, branch)
    set((state) => ({
      git: result.info ? { ...state.git, [projectId]: result.info } : state.git,
      gitLoading: { ...state.gitLoading, [projectId]: false },
      gitErrors: {
        ...state.gitErrors,
        [projectId]: result.ok
          ? undefined
          : gitError('Could not switch branch', 'git switch failed', result.error)
      }
    }))
    // The working tree changed under the new branch — refresh the changes badge
    // now rather than waiting up to 4s for the poller.
    if (result.ok) void get().refreshGitStatus(projectId)
  },

  async addWorktree(projectId, name, baseBranch) {
    const project = get().projects.find((candidate) => candidate.id === projectId)
    if (!project) return
    set((state) => ({
      gitLoading: { ...state.gitLoading, [projectId]: true },
      gitErrors: { ...state.gitErrors, [projectId]: undefined }
    }))
    const prevPaths = new Set(
      (get().git[projectId]?.worktrees ?? []).map((worktree) => worktree.path)
    )
    const result = await window.gc.git.addWorktree(
      project.path,
      name,
      baseBranch,
      get().settings.worktreeDirectory
    )
    const worktreeName = name.trim()
    // Creating a worktree means working in it: select it on success. Prefer the
    // new path when we have a prior snapshot; with no snapshot, branch matching is
    // safer than treating every returned path as new and selecting the main tree.
    const created = result.ok
      ? (prevPaths.size > 0
          ? result.info?.worktrees.find((worktree) => !prevPaths.has(worktree.path))
          : undefined) ??
        result.info?.worktrees.find((worktree) => worktree.branch === worktreeName)
      : undefined
    set((state) => {
      const projects = created
        ? state.projects.map((candidate) =>
            candidate.id === projectId
              ? { ...candidate, activeWorktreePath: created.path }
              : candidate
          )
        : state.projects
      const updatedProject = projects.find((candidate) => candidate.id === projectId)
      // Selecting the created worktree activates it like selectWorktree does;
      // pointers stay untouched if the user switched projects mid-creation.
      const selectsCreated = !!created && state.activeProjectId === projectId
      return {
        git: result.info ? { ...state.git, [projectId]: result.info } : state.git,
        gitLoading: { ...state.gitLoading, [projectId]: false },
        gitErrors: {
          ...state.gitErrors,
          [projectId]: result.ok
            ? undefined
            : gitError('Could not create worktree', 'git worktree add failed', result.error)
        },
        projects,
        ...(selectsCreated
          ? {
              activatedWorktrees: addActivatedWorktree(
                state.activatedWorktrees,
                projectId,
                created.path
              ),
              ...worktreePointers(state, updatedProject)
            }
          : {})
      }
    })
    if (created) persist(get)
  },

  async removeWorktree(projectId, worktreePath, deleteBranch) {
    const project = get().projects.find((candidate) => candidate.id === projectId)
    if (!project) return
    set((state) => ({
      gitLoading: { ...state.gitLoading, [projectId]: true },
      gitErrors: { ...state.gitErrors, [projectId]: undefined }
    }))
    const result = await window.gc.git.removeWorktree(project.path, worktreePath, deleteBranch)
    if (result.ok) {
      set((state) => {
        const slices = cleanupWorktreeScope(cleanupSlicesFromStore(state), projectId, worktreePath)
        const updatedProject = state.projects.find((candidate) => candidate.id === projectId)
        return {
          ...slices,
          ...(state.activeProjectId === projectId
            ? worktreePointers(slices, updatedProject)
            : {})
        }
      })
      persist(get)
    }
    // refreshGit re-derives the active worktree (the removed one may have been
    // selected) and clears the loading flag.
    await get().refreshGit(projectId)
    if (!result.ok) {
      set((state) => ({
        gitErrors: {
          ...state.gitErrors,
          [projectId]: gitError(
            'Could not delete worktree',
            'git worktree remove failed',
            result.error
          )
        }
      }))
    }
  },

  clearGitError(projectId) {
    set((state) => ({
      gitErrors: { ...state.gitErrors, [projectId]: undefined }
    }))
  },

  setView(view) {
    set({ view })
  },

  setTerminalPanelOpen(open) {
    set({ terminalPanelOpen: open })
  },

  newShellTerminal() {
    const { activeProjectId, projects, shellTerminals, shellTerminalSeq } = get()
    if (!activeProjectId) return
    const project = projects.find((p) => p.id === activeProjectId)
    if (!project) return
    const worktreeKey = selectedWorktreeKey(project)
    const scopeKey = worktreeScopeKey(activeProjectId, worktreeKey)
    // Cap in the action (not just the disabled button) so a double-click can't
    // mint a 7th (ADR-005).
    const count = visibleTerminals(shellTerminals, activeProjectId, worktreeKey).length
    if (count >= MAX_SHELL_TERMINALS) return
    const seq = (shellTerminalSeq[scopeKey] ?? 0) + 1
    const terminal: ShellTerminal = {
      id: uuid(),
      projectId: activeProjectId,
      cwd: worktreeKey,
      title: `Terminal ${seq}`,
      visible: true,
      fontSize: null,
      createdAt: Date.now()
    }
    set((s) => ({
      shellTerminals: [...s.shellTerminals, terminal],
      shellTerminalSeq: { ...s.shellTerminalSeq, [scopeKey]: seq },
      activatedWorktrees: addActivatedWorktree(s.activatedWorktrees, activeProjectId, worktreeKey),
      terminalPanelOpen: true,
      focusedShellTerminalByWorktree: setFocusedShellForWorktree(
        s.focusedShellTerminalByWorktree,
        activeProjectId,
        worktreeKey,
        terminal.id
      ),
      focusedShellTerminalId: terminal.id,
      shellFocusSeq: s.shellFocusSeq + 1
    }))
    persist(get)
  },

  async trashShellTerminal(id) {
    const terminal = get().shellTerminals.find((t) => t.id === id)
    if (!terminal) return
    // Confirm only while the shell is alive — an exited shell has nothing left
    // to kill, so trashing it is just cleanup.
    if (!get().shellExited[id]) {
      const confirmed = await window.gc.dialog.confirmTrashTerminal(terminal.title)
      if (!confirmed) return
    }
    // Removing the record unmounts the column, which kills the PTY (ADR-0008).
    set((s) => {
      const trashed = s.shellTerminals.find((t) => t.id === id)
      const shellTerminals = s.shellTerminals.filter((t) => t.id !== id)
      const worktreeKey = trashed?.cwd ?? ''
      const shellTerminalSeq = trashed
        ? resetShellTerminalSeqAfterTrash(
            s.shellTerminalSeq,
            trashed.projectId,
            worktreeKey,
            shellTerminals
          )
        : s.shellTerminalSeq
      const nextFocus =
        s.focusedShellTerminalId === id && trashed
          ? retargetFocusedShellInWorktree(
              shellTerminals,
              trashed.projectId,
              worktreeKey,
              id
            )
          : s.focusedShellTerminalId
      const scopeKey = trashed ? worktreeScopeKey(trashed.projectId, worktreeKey) : ''
      const focusedShellTerminalByWorktree =
        trashed && scopeKey && s.focusedShellTerminalByWorktree[scopeKey] === id
          ? setFocusedShellForWorktree(
              s.focusedShellTerminalByWorktree,
              trashed.projectId,
              worktreeKey,
              nextFocus
            )
          : s.focusedShellTerminalByWorktree
      return {
        shellTerminals,
        shellTerminalSeq,
        focusedShellTerminalByWorktree,
        focusedShellTerminalId: nextFocus,
        shellExited: { ...s.shellExited, [id]: undefined }
      }
    })
    persist(get)
  },

  async trashProjectShellTerminals() {
    const { activeProjectId, projects, shellTerminals, shellExited } = get()
    if (!activeProjectId) return
    const project = projects.find((p) => p.id === activeProjectId)
    if (!project) return
    const worktreeKey = selectedWorktreeKey(project)
    const worktreeTerminals = visibleTerminals(shellTerminals, activeProjectId, worktreeKey)
    if (worktreeTerminals.length <= 1) return

    if (worktreeTerminals.some((t) => !shellExited[t.id])) {
      const confirmed = await window.gc.dialog.confirmTrashTerminals(worktreeTerminals.length)
      if (!confirmed) return
    }

    set((s) => {
      const trashedIds = new Set(worktreeTerminals.map((t) => t.id))
      const scopeKey = worktreeScopeKey(activeProjectId, worktreeKey)
      const shellTerminalSeq = { ...s.shellTerminalSeq }
      delete shellTerminalSeq[scopeKey]
      return {
        shellTerminals: s.shellTerminals.filter((t) => !trashedIds.has(t.id)),
        shellTerminalSeq,
        focusedShellTerminalByWorktree: setFocusedShellForWorktree(
          s.focusedShellTerminalByWorktree,
          activeProjectId,
          worktreeKey,
          null
        ),
        focusedShellTerminalId:
          s.focusedShellTerminalId && trashedIds.has(s.focusedShellTerminalId)
            ? null
            : s.focusedShellTerminalId,
        shellExited: Object.fromEntries(
          Object.entries(s.shellExited).filter(([terminalId]) => !trashedIds.has(terminalId))
        ),
        terminalPanelOpen: false
      }
    })
    persist(get)
  },

  focusShellTerminal(id) {
    const terminal = get().shellTerminals.find((t) => t.id === id)
    if (!terminal) return
    const worktreeKey = terminal.cwd
    // Focusing a hidden terminal re-shows its column first (ADR-006).
    set((s) => ({
      shellTerminals: terminal.visible
        ? s.shellTerminals
        : s.shellTerminals.map((t) => (t.id === id ? { ...t, visible: true } : t)),
      focusedShellTerminalByWorktree: setFocusedShellForWorktree(
        s.focusedShellTerminalByWorktree,
        terminal.projectId,
        worktreeKey,
        id
      ),
      focusedShellTerminalId: id,
      shellFocusSeq: s.shellFocusSeq + 1
    }))
    if (!terminal.visible) persist(get)
  },

  hideShellTerminal(id) {
    const terminal = get().shellTerminals.find((t) => t.id === id)
    if (!terminal || !terminal.visible) return
    const worktreeKey = terminal.cwd
    // Hide is display-only: the tab stays, the PTY keeps running (ADR-006).
    set((s) => {
      const shellTerminals = s.shellTerminals.map((t) =>
        t.id === id ? { ...t, visible: false } : t
      )
      const nextFocus =
        s.focusedShellTerminalId === id
          ? retargetFocusedShellInWorktree(
              shellTerminals,
              terminal.projectId,
              worktreeKey,
              id
            )
          : s.focusedShellTerminalId
      const scopeKey = worktreeScopeKey(terminal.projectId, worktreeKey)
      const focusedShellTerminalByWorktree =
        s.focusedShellTerminalByWorktree[scopeKey] === id
          ? setFocusedShellForWorktree(
              s.focusedShellTerminalByWorktree,
              terminal.projectId,
              worktreeKey,
              nextFocus
            )
          : s.focusedShellTerminalByWorktree
      return {
        shellTerminals,
        focusedShellTerminalByWorktree,
        focusedShellTerminalId: nextFocus
      }
    })
    persist(get)
  },

  renameShellTerminal(id, title) {
    const trimmed = title.trim()
    if (!trimmed) return
    set((s) => ({
      shellTerminals: s.shellTerminals.map((t) => (t.id === id ? { ...t, title: trimmed } : t))
    }))
    persist(get)
  },

  setShellTerminalFontSize(id, fontSize) {
    set((s) => ({
      shellTerminals: s.shellTerminals.map((t) => (t.id === id ? { ...t, fontSize } : t))
    }))
    persist(get)
  },

  markShellTerminalExited(id, reason = 'exited') {
    if (!get().shellTerminals.some((t) => t.id === id)) return
    set((s) => ({ shellExited: { ...s.shellExited, [id]: reason } }))
  },

  clearShellTerminalExited(id) {
    set((s) => ({ shellExited: { ...s.shellExited, [id]: undefined } }))
  },

  async addProject() {
    const path = await window.gc.dialog.pickDirectory()
    if (!path) return
    const existing = get().projects.find((p) => p.path === path)
    if (existing) {
      const worktreeKey = selectedWorktreeKey(existing)
      set((s) => ({
        view: 'workspace',
        projects: s.projects.map((p) =>
          p.id === existing.id ? { ...p, archived: false, archivedAt: null } : p
        ),
        activeProjectId: existing.id,
        activatedWorktrees: addActivatedWorktree(s.activatedWorktrees, existing.id, worktreeKey),
        ...worktreePointers(s, existing)
      }))
      persist(get)
      return
    }
    const name = path.split('/').filter(Boolean).pop() || path
    const color = PROJECT_COLORS[get().projects.length % PROJECT_COLORS.length]
    const project: Project = {
      id: uuid(),
      path,
      name,
      color,
      addedAt: Date.now(),
      activeWorktreePath: null,
      archived: false,
      archivedAt: null
    }
    const worktreeKey = selectedWorktreeKey(project)
    set((s) => ({
      view: 'workspace',
      projects: [...s.projects, project],
      activeProjectId: project.id,
      activeSessionId: null,
      focusedShellTerminalId: null,
      activatedWorktrees: addActivatedWorktree(s.activatedWorktrees, project.id, worktreeKey)
    }))
    persist(get)
  },

  clearActiveProject() {
    const activeProject = get().projects.find((p) => p.id === get().activeProjectId && !p.archived)
    set({
      view: activeProject ? 'welcome' : 'workspace',
      activeProjectId: null,
      activeSessionId: null,
      focusedShellTerminalId: null
    })
  },

  archiveProject(id) {
    set((s) => {
      const hasActive = s.projects.some((p) => p.id !== id && !p.archived)
      const runtime = deactivateProjectScopes(s, id)
      return {
        projects: s.projects.map((p) =>
          p.id === id ? { ...p, archived: true, archivedAt: Date.now() } : p
        ),
        sessions: s.sessions.map((se) =>
          se.projectId === id ? { ...se, archived: true, archivedAt: Date.now() } : se
        ),
        liveIds: s.liveIds.filter((liveId) => {
          const session = s.sessions.find((se) => se.id === liveId)
          return session && session.projectId !== id
        }),
        shellExited: Object.fromEntries(
          Object.entries(s.shellExited).filter(
            ([tid]) => s.shellTerminals.find((t) => t.id === tid)?.projectId !== id
          )
        ),
        ...runtime,
        activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
        activeSessionId: null,
        focusedShellTerminalId: null,
        view: !hasActive ? 'welcome' : s.activeProjectId === id ? 'welcome' : s.view
      }
    })
    persist(get)
  },

  async deleteProject(id) {
    const project = get().projects.find((p) => p.id === id)
    if (!project) return
    // Use Electron dialog for confirmation.
    const confirmed = await window.gc.dialog.confirmDelete(project.name)
    if (!confirmed) return
    set((s) => {
      const newProjects = s.projects.filter((p) => p.id !== id)
      const hasActive = newProjects.some((p) => !p.archived)
      const slices = cleanupProjectScopes(cleanupSlicesFromStore(s), id)
      return {
        projects: newProjects,
        ...slices,
        activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
        activeSessionId: null,
        focusedShellTerminalId: null,
        view: !hasActive ? 'welcome' : s.activeProjectId === id ? 'welcome' : s.view
      }
    })
    persist(get)
  },

  selectProject(id) {
    // Picking a project always drops back to the workspace, even if it's already
    // active (e.g. clicked from the settings view).
    if (id === get().activeProjectId) {
      set({ view: 'workspace' })
      return
    }
    set((s) => {
      const project = s.projects.find((p) => p.id === id)
      const worktreeKey = project ? selectedWorktreeKey(project) : ''
      const activatedWorktrees = project
        ? addActivatedWorktree(s.activatedWorktrees, id, worktreeKey)
        : s.activatedWorktrees
      const pointers = worktreePointers(s, project)
      return {
        view: 'workspace',
        activeProjectId: id,
        activatedWorktrees,
        ...pointers
      }
    })
    persist(get)
  },

  openNewSession() {
    if (get().activeProjectId) set({ newSessionOpen: true })
  },

  closeNewSession() {
    set({ newSessionOpen: false })
  },

  newSession(agent) {
    const { activeProjectId, projects } = get()
    if (!activeProjectId) return
    const project = projects.find((p) => p.id === activeProjectId)
    if (!project) return
    const worktreeKey = selectedWorktreeKey(project)
    const now = Date.now()
    const session: Session = {
      id: uuid(),
      projectId: activeProjectId,
      agent,
      // claude: we own the id now. cursor: backfilled post create-chat. codex/
      // opencode: backfilled once they persist a record on the first message.
      agentSessionId: agent === 'claude' ? uuid() : null,
      // claude keeps the placeholder so its transcript title fills in; others get
      // a stable fallback (non-placeholder ⇒ never auto-derived).
      title: agent === 'claude' ? PLACEHOLDER_TITLE : agentFallbackTitle(agent, project.name),
      cwd: worktreeKey,
      status: 'pending',
      started: false,
      renamed: false,
      archived: false,
      archivedAt: null,
      createdAt: now,
      lastActiveAt: now
    }
    set((s) => ({
      sessions: [...s.sessions, session],
      activeSessionByWorktree: setActiveSessionForWorktree(
        s.activeSessionByWorktree,
        activeProjectId,
        worktreeKey,
        session.id
      ),
      activeSessionId: session.id,
      newSessionOpen: false
    }))
    set((s) => withLive(s, session.id)) // mount → spawns the chosen agent
    persist(get)
  },

  selectSession(id) {
    const session = get().sessions.find((s) => s.id === id)
    if (!session || session.archived) return
    set((s) => ({
      activeSessionByWorktree: setActiveSessionForWorktree(
        s.activeSessionByWorktree,
        session.projectId,
        session.cwd,
        id
      ),
      activeSessionId: id,
      sessions: s.sessions.map((se) =>
        se.id === id ? { ...se, lastActiveAt: Date.now() } : se
      )
    }))
    set((s) => withLive(s, id)) // cold → mount → spawns with --resume
    persist(get)
  },

  requestArchiveSession(id) {
    if (get().sessions.some((se) => se.id === id && !se.archived)) {
      set({ sessionToArchive: id })
    }
  },

  cancelArchiveSession() {
    set({ sessionToArchive: null })
  },

  archiveSession(id) {
    set((s) => {
      const session = s.sessions.find((se) => se.id === id)
      const activeSessionByWorktree = session
        ? pruneActiveSessionForWorktree(
            s.activeSessionByWorktree,
            session.projectId,
            session.cwd,
            id
          )
        : s.activeSessionByWorktree
      return {
        liveIds: s.liveIds.filter((x) => x !== id),
        activeSessionByWorktree,
        activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
        sessionToArchive: s.sessionToArchive === id ? null : s.sessionToArchive,
        errors: { ...s.errors, [id]: undefined },
        sessions: s.sessions.map((se) =>
          se.id === id ? { ...se, archived: true, archivedAt: Date.now() } : se
        )
      }
    })
    persist(get)
  },

  markStarted(id) {
    set((s) => ({
      sessions: s.sessions.map((se) =>
        se.id === id ? { ...se, started: true, status: 'running' as SessionStatus } : se
      ),
      errors: { ...s.errors, [id]: undefined }
    }))
    persist(get)
  },

  markRunning(id) {
    set((s) => ({
      sessions: s.sessions.map((se) =>
        se.id === id ? { ...se, status: 'running' as SessionStatus } : se
      )
    }))
  },

  markExited(id) {
    const session = get().sessions.find((s) => s.id === id)
    if (!session || session.archived) return
    set((s) => ({
      // Unmount on exit so a later select re-mounts → resumes (PLAN §7).
      liveIds: s.liveIds.filter((x) => x !== id),
      sessions: s.sessions.map((se) =>
        se.id === id ? { ...se, status: 'exited' as SessionStatus } : se
      )
    }))
    persist(get)
  },

  setError(id, message) {
    const session = get().sessions.find((s) => s.id === id)
    if (!session || session.archived) return
    set((s) => ({
      errors: { ...s.errors, [id]: message },
      liveIds: s.liveIds.filter((x) => x !== id),
      sessions: s.sessions.map((se) =>
        se.id === id ? { ...se, status: 'exited' as SessionStatus } : se
      )
    }))
  },

  setAgentSessionId(id, agentSessionId) {
    const session = get().sessions.find((s) => s.id === id)
    if (!session || session.agentSessionId === agentSessionId) return
    set((s) => ({
      sessions: s.sessions.map((se) => (se.id === id ? { ...se, agentSessionId } : se))
    }))
    persist(get)
  },

  renameSession(id, title) {
    const trimmed = title.trim()
    if (!trimmed) return
    const existing = get().sessions.find((s) => s.id === id)
    // No-op when the title is unchanged: otherwise opening the rename field and
    // clicking away (draft pre-filled with the current title) would flip
    // `renamed` and permanently suppress the transcript-derived auto-title.
    if (!existing || existing.title === trimmed) return
    set((s) => ({
      sessions: s.sessions.map((se) =>
        se.id === id ? { ...se, title: trimmed, renamed: true } : se
      )
    }))
    persist(get)
  },

  async refreshTitle(id) {
    const session = get().sessions.find((s) => s.id === id)
    // Only Claude derives titles from its transcript; a manual rename or a
    // non-placeholder fallback title is left untouched (PLAN 003 §4.4).
    if (
      !session ||
      session.agent !== 'claude' ||
      session.renamed ||
      session.title !== PLACEHOLDER_TITLE ||
      !session.agentSessionId
    )
      return
    const title = await window.gc.transcript.deriveTitle(session.agentSessionId)
    if (!title) return
    set((s) => ({
      sessions: s.sessions.map((se) => (se.id === id ? { ...se, title } : se))
    }))
    persist(get)
  }
}))
