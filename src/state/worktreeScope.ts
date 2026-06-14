import type { GitProjectInfo, Project, Session, ShellTerminal } from '@shared/types'

/** Delimiter for compound scope keys — not valid in UUIDs or normalized absolute paths. */
export const SCOPE_KEY_SEP = '\x1e'

export type WorktreeScope = { projectId: string; cwd: string }

export type CleanupSlices = {
  sessions: Session[]
  liveIds: string[]
  errors: Record<string, string | undefined>
  shellTerminals: ShellTerminal[]
  shellExited: Record<string, 'exited' | 'spawn-failed' | undefined>
  shellTerminalSeq: Record<string, number>
  activatedWorktrees: WorktreeScope[]
  activeSessionByWorktree: Record<string, string | undefined>
  focusedShellTerminalByWorktree: Record<string, string | undefined>
}

/** Compound runtime/persistence key for a scoped worktree: (projectId, cwd). */
export function worktreeScopeKey(projectId: string, cwd: string): string {
  return `${projectId}${SCOPE_KEY_SEP}${cwd}`
}

export function selectedWorktreeKey(
  project: Pick<Project, 'path' | 'activeWorktreePath'>
): string {
  return project.activeWorktreePath ?? project.path
}

export function visibleSessions(
  sessions: Session[],
  projectId: string,
  worktreeKey: string
): Session[] {
  return sessions.filter(
    (s) => s.projectId === projectId && s.cwd === worktreeKey && !s.archived
  )
}

export function visibleTerminals(
  terminals: ShellTerminal[],
  projectId: string,
  worktreeKey: string
): ShellTerminal[] {
  return terminals.filter((t) => t.projectId === projectId && t.cwd === worktreeKey)
}

export function activeSessionForWorktree(
  map: Record<string, string | undefined>,
  projectId: string,
  cwd: string
): string | null {
  return map[worktreeScopeKey(projectId, cwd)] ?? null
}

export function setActiveSessionForWorktree(
  map: Record<string, string | undefined>,
  projectId: string,
  cwd: string,
  sessionId: string | null
): Record<string, string | undefined> {
  const key = worktreeScopeKey(projectId, cwd)
  if (sessionId === null) {
    const next = { ...map }
    delete next[key]
    return next
  }
  return { ...map, [key]: sessionId }
}

export function pruneActiveSessionForWorktree(
  map: Record<string, string | undefined>,
  projectId: string,
  cwd: string,
  sessionId: string
): Record<string, string | undefined> {
  const key = worktreeScopeKey(projectId, cwd)
  if (map[key] !== sessionId) return map
  return setActiveSessionForWorktree(map, projectId, cwd, null)
}

export function resolveActiveSessionId(
  map: Record<string, string | undefined>,
  sessions: Session[],
  projectId: string,
  worktreeKey: string
): string | null {
  const id = map[worktreeScopeKey(projectId, worktreeKey)]
  if (!id) return null
  const session = sessions.find((s) => s.id === id)
  if (
    !session ||
    session.projectId !== projectId ||
    session.cwd !== worktreeKey ||
    session.archived
  ) {
    return null
  }
  return id
}

export function setFocusedShellForWorktree(
  map: Record<string, string | undefined>,
  projectId: string,
  cwd: string,
  terminalId: string | null
): Record<string, string | undefined> {
  const key = worktreeScopeKey(projectId, cwd)
  if (terminalId === null) {
    const next = { ...map }
    delete next[key]
    return next
  }
  return { ...map, [key]: terminalId }
}

export function retargetFocusedShellInWorktree(
  terminals: ShellTerminal[],
  projectId: string,
  worktreeKey: string,
  excludeId?: string
): string | null {
  return (
    terminals.findLast(
      (t) =>
        t.projectId === projectId &&
        t.cwd === worktreeKey &&
        t.visible &&
        (!excludeId || t.id !== excludeId)
    )?.id ?? null
  )
}

export function resolveFocusedShellId(
  map: Record<string, string | undefined>,
  terminals: ShellTerminal[],
  projectId: string,
  worktreeKey: string
): string | null {
  const id = map[worktreeScopeKey(projectId, worktreeKey)]
  // No entry (fresh run with restored tabs) hands the outline to the last
  // visible terminal in scope — same fallback as a stale entry (P007 handoff).
  if (!id) return retargetFocusedShellInWorktree(terminals, projectId, worktreeKey)
  const terminal = terminals.find((t) => t.id === id)
  // A hidden terminal can't hold the visible outline — hand off like the
  // fallback does (which already requires `visible`).
  if (
    !terminal ||
    terminal.projectId !== projectId ||
    terminal.cwd !== worktreeKey ||
    !terminal.visible
  ) {
    return retargetFocusedShellInWorktree(terminals, projectId, worktreeKey)
  }
  return id
}

export function isWorktreeActivated(
  scopes: WorktreeScope[],
  projectId: string,
  cwd: string
): boolean {
  return scopes.some((s) => s.projectId === projectId && s.cwd === cwd)
}

export function addActivatedWorktree(
  scopes: WorktreeScope[],
  projectId: string,
  cwd: string
): WorktreeScope[] {
  if (isWorktreeActivated(scopes, projectId, cwd)) return scopes
  return [...scopes, { projectId, cwd }]
}

export function removeActivatedWorktreesForProject(
  scopes: WorktreeScope[],
  projectId: string
): WorktreeScope[] {
  return scopes.filter((s) => s.projectId !== projectId)
}

export function removeActivatedWorktree(
  scopes: WorktreeScope[],
  projectId: string,
  cwd: string
): WorktreeScope[] {
  return scopes.filter((s) => !(s.projectId === projectId && s.cwd === cwd))
}

export function shellTerminalTitleSeq(title: string): number | null {
  const match = /^Terminal ([1-9]\d*)$/.exec(title.trim())
  if (!match) return null
  return Number(match[1])
}

export function resetShellTerminalSeqAfterTrash(
  seq: Record<string, number>,
  projectId: string,
  cwd: string,
  terminals: ShellTerminal[]
): Record<string, number> {
  const scopeKey = worktreeScopeKey(projectId, cwd)
  const remaining = terminals.filter((t) => t.projectId === projectId && t.cwd === cwd)
  if (remaining.length > 1) return seq

  const next = { ...seq }
  if (remaining.length === 0) {
    delete next[scopeKey]
  } else {
    next[scopeKey] = shellTerminalTitleSeq(remaining[0].title) ?? 1
  }
  return next
}

/** Compound scope keys belonging to one project. */
export function scopedScopeKeysForProject(
  sessions: Session[],
  shellTerminals: ShellTerminal[],
  activatedWorktrees: WorktreeScope[],
  projectId: string
): Set<string> {
  const keys = new Set<string>()
  for (const s of sessions) {
    if (s.projectId === projectId) keys.add(worktreeScopeKey(projectId, s.cwd))
  }
  for (const t of shellTerminals) {
    if (t.projectId === projectId) keys.add(worktreeScopeKey(projectId, t.cwd))
  }
  for (const scope of activatedWorktrees) {
    if (scope.projectId === projectId) keys.add(worktreeScopeKey(projectId, scope.cwd))
  }
  return keys
}

/** Normalized cwd paths scoped under a project (for git presence checks). */
export function scopedCwdsForProject(
  sessions: Session[],
  shellTerminals: ShellTerminal[],
  activatedWorktrees: WorktreeScope[],
  projectId: string
): Set<string> {
  const cwds = new Set<string>()
  for (const s of sessions) {
    if (s.projectId === projectId) cwds.add(s.cwd)
  }
  for (const t of shellTerminals) {
    if (t.projectId === projectId) cwds.add(t.cwd)
  }
  for (const scope of activatedWorktrees) {
    if (scope.projectId === projectId) cwds.add(scope.cwd)
  }
  return cwds
}

function scopedSessionIds(
  sessions: Session[],
  projectId: string,
  worktreeKey: string
): Set<string> {
  return new Set(
    sessions.filter((s) => s.projectId === projectId && s.cwd === worktreeKey).map((s) => s.id)
  )
}

function scopedTerminalIds(
  terminals: ShellTerminal[],
  projectId: string,
  worktreeKey: string
): Set<string> {
  return new Set(
    terminals.filter((t) => t.projectId === projectId && t.cwd === worktreeKey).map((t) => t.id)
  )
}

export function cleanupWorktreeScope(
  slices: CleanupSlices,
  projectId: string,
  removedWorktreeKey: string
): CleanupSlices {
  const scopeKey = worktreeScopeKey(projectId, removedWorktreeKey)
  const sessionIds = scopedSessionIds(slices.sessions, projectId, removedWorktreeKey)
  const terminalIds = scopedTerminalIds(slices.shellTerminals, projectId, removedWorktreeKey)

  const sessions = slices.sessions.filter((s) => !sessionIds.has(s.id))
  const liveIds = slices.liveIds.filter((id) => !sessionIds.has(id))
  const errors = Object.fromEntries(
    Object.entries(slices.errors).filter(([id]) => !sessionIds.has(id))
  ) as Record<string, string | undefined>
  const shellTerminals = slices.shellTerminals.filter((t) => !terminalIds.has(t.id))
  const shellExited = Object.fromEntries(
    Object.entries(slices.shellExited).filter(([id]) => !terminalIds.has(id))
  ) as Record<string, 'exited' | 'spawn-failed' | undefined>

  const shellTerminalSeq = { ...slices.shellTerminalSeq }
  delete shellTerminalSeq[scopeKey]

  const activatedWorktrees = removeActivatedWorktree(
    slices.activatedWorktrees,
    projectId,
    removedWorktreeKey
  )

  const activeSessionByWorktree = { ...slices.activeSessionByWorktree }
  delete activeSessionByWorktree[scopeKey]

  const focusedShellTerminalByWorktree = { ...slices.focusedShellTerminalByWorktree }
  delete focusedShellTerminalByWorktree[scopeKey]

  return {
    sessions,
    liveIds,
    errors,
    shellTerminals,
    shellExited,
    shellTerminalSeq,
    activatedWorktrees,
    activeSessionByWorktree,
    focusedShellTerminalByWorktree
  }
}

export function cleanupProjectScopes(
  slices: CleanupSlices,
  projectId: string
): CleanupSlices {
  const sessionIds = new Set(
    slices.sessions.filter((s) => s.projectId === projectId).map((s) => s.id)
  )
  const terminalIds = new Set(
    slices.shellTerminals.filter((t) => t.projectId === projectId).map((t) => t.id)
  )
  const projectScopeKeys = scopedScopeKeysForProject(
    slices.sessions,
    slices.shellTerminals,
    slices.activatedWorktrees,
    projectId
  )

  const sessions = slices.sessions.filter((s) => s.projectId !== projectId)
  const liveIds = slices.liveIds.filter((id) => !sessionIds.has(id))
  const errors = Object.fromEntries(
    Object.entries(slices.errors).filter(([id]) => !sessionIds.has(id))
  ) as Record<string, string | undefined>
  const shellTerminals = slices.shellTerminals.filter((t) => t.projectId !== projectId)
  const shellExited = Object.fromEntries(
    Object.entries(slices.shellExited).filter(([id]) => !terminalIds.has(id))
  ) as Record<string, 'exited' | 'spawn-failed' | undefined>

  const shellTerminalSeq = { ...slices.shellTerminalSeq }
  for (const key of projectScopeKeys) delete shellTerminalSeq[key]

  const activatedWorktrees = removeActivatedWorktreesForProject(
    slices.activatedWorktrees,
    projectId
  )

  const activeSessionByWorktree = { ...slices.activeSessionByWorktree }
  for (const key of projectScopeKeys) delete activeSessionByWorktree[key]

  const focusedShellTerminalByWorktree = { ...slices.focusedShellTerminalByWorktree }
  for (const key of projectScopeKeys) delete focusedShellTerminalByWorktree[key]

  return {
    sessions,
    liveIds,
    errors,
    shellTerminals,
    shellExited,
    shellTerminalSeq,
    activatedWorktrees,
    activeSessionByWorktree,
    focusedShellTerminalByWorktree
  }
}

export function deactivateProjectScopes(
  slices: Pick<
    CleanupSlices,
    'activatedWorktrees' | 'activeSessionByWorktree' | 'focusedShellTerminalByWorktree'
  > & {
    sessions: Session[]
    shellTerminals: ShellTerminal[]
  },
  projectId: string
): Pick<
  CleanupSlices,
  'activatedWorktrees' | 'activeSessionByWorktree' | 'focusedShellTerminalByWorktree'
> {
  const projectScopeKeys = scopedScopeKeysForProject(
    slices.sessions,
    slices.shellTerminals,
    slices.activatedWorktrees,
    projectId
  )

  const activeSessionByWorktree = { ...slices.activeSessionByWorktree }
  const focusedShellTerminalByWorktree = { ...slices.focusedShellTerminalByWorktree }
  for (const key of projectScopeKeys) {
    delete activeSessionByWorktree[key]
    delete focusedShellTerminalByWorktree[key]
  }

  return {
    activatedWorktrees: removeActivatedWorktreesForProject(slices.activatedWorktrees, projectId),
    activeSessionByWorktree,
    focusedShellTerminalByWorktree
  }
}

export function shouldRunExternalCleanup(info: GitProjectInfo): boolean {
  return info.isRepository === true && !info.error
}

export function missingScopedKeysFromGit(
  sessions: Session[],
  shellTerminals: ShellTerminal[],
  activatedWorktrees: WorktreeScope[],
  projectId: string,
  info: GitProjectInfo,
  projectPath: string
): string[] {
  if (!shouldRunExternalCleanup(info)) return []
  const present = new Set(info.worktrees.map((w) => w.path))
  const cwds = scopedCwdsForProject(sessions, shellTerminals, activatedWorktrees, projectId)
  // The project root is never a removed worktree: a project picked at a
  // subdirectory inside a repo pins pre-refresh records to that subdir, which
  // git's worktree list will never contain (P009 §Risks). Those records stay
  // pinned-but-alive instead of being destroyed by a background refresh.
  return [...cwds].filter((cwd) => cwd !== projectPath && !present.has(cwd))
}
