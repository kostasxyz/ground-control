import { AGENTS, type AgentId } from '@shared/agents'

/** Title shown before Claude's transcript reveals the first prompt (PLAN §6, §8). */
export const PLACEHOLDER_TITLE = 'Waiting for initial prompt…'

/**
 * Initial title for a non-Claude session (PLAN 003 §4.4). Claude keeps the
 * placeholder so its transcript-derived title fills in; the others get a stable
 * fallback the user can rename. Non-placeholder ⇒ never auto-derived.
 */
export function agentFallbackTitle(agent: AgentId, projectName: string): string {
  return `${AGENTS[agent].label} · ${projectName}`
}

/**
 * How many sessions keep a live PTY + mounted terminal at once (PLAN §13.1,
 * hybrid default). The active and most-recently-used stay hot for instant
 * switching; older ones are killed and lazily resumed on return.
 */
export const MAX_LIVE_SESSIONS = 10

/** Project shell terminals per project (P007 ADR-005). Bounds PTY + hidden
 *  xterm DOM accumulation; gates the dock's + New. No eviction logic. */
export const MAX_SHELL_TERMINALS = 6

/** Sessions↔console split (px). The sessions pane is width-controlled and
 *  drag-resizable; the console takes the remainder. Persisted in settings. */
export const SESSIONS_PANE_DEFAULT = 360
export const SESSIONS_PANE_MIN = 220
/** Smallest the console may get while dragging — keeps the terminal usable. */
export const CONSOLE_PANE_MIN = 320
export const PANE_DIVIDER_WIDTH = 1

/** Clamp a sessions-pane width to its min and the room left for the console. */
export function clampSessionsWidth(px: number, contentWidth: number): number {
  const max = Math.max(SESSIONS_PANE_MIN, contentWidth - PANE_DIVIDER_WIDTH - CONSOLE_PANE_MIN)
  return Math.round(Math.min(Math.max(px, SESSIONS_PANE_MIN), max))
}

/** Git diff viewer file-list↔diff split (px). */
export const GIT_DIFF_FILE_LIST_DEFAULT = 260
export const GIT_DIFF_FILE_LIST_MIN = 180
/** Smallest the diff pane may get while dragging — keeps the diff readable. */
export const GIT_DIFF_DIFF_PANE_MIN = 320

/** Clamp the Git diff file-list width to its min and the room left for the diff pane. */
export function clampGitDiffFileListWidth(px: number, contentWidth: number): number {
  const max = Math.max(
    GIT_DIFF_FILE_LIST_MIN,
    contentWidth - PANE_DIVIDER_WIDTH - GIT_DIFF_DIFF_PANE_MIN
  )
  return Math.round(Math.min(Math.max(px, GIT_DIFF_FILE_LIST_MIN), max))
}

/** Rail colors assigned round-robin to new projects. */
export const PROJECT_COLORS = [
  '#ff8636',
  '#5fd6c2',
  '#f5b042',
  '#ff5e3a',
  '#bb9af7',
  '#7aa2f7'
]

export function initials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim()
  if (!cleaned) return '◇'
  const words = cleaned.split(' ')
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return cleaned.slice(0, 2).toUpperCase()
}

/** Replace the home dir prefix with ~ for compact display. */
export function tildeify(p: string, homeDir?: string | null): string {
  if (!homeDir) return p
  const home = homeDir.replace(/[\\/]+$/, '')
  if (!home) return p
  if (p === home) return '~'
  const next = p[home.length]
  if (p.startsWith(home) && (next === '/' || next === '\\')) return '~' + p.slice(home.length)
  return p
}
