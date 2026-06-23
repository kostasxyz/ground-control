import type { Settings } from './types'
import {
  DEFAULT_APP_THEME_ID,
  isAppThemeId,
  appThemeScheme,
  type AppThemeId
} from './appThemes'
import {
  DEFAULT_TERMINAL_THEME_ID,
  isTerminalThemeId,
  type TerminalThemeId
} from './terminalThemes'
import {
  FONT_SIZE_BOUNDS,
  UI_BODY_FONTS,
  UI_HEADING_FONTS,
  TERMINAL_FONTS,
  type BodyFontId,
  type HeadingFontId,
  type TerminalFontId
} from './fonts'
import { isSafeTerminalBgFilename } from './terminalBg'

export const DEFAULT_TERMINAL_BACKGROUND_OPACITY = 33
export const DEFAULT_WORKTREE_DIRECTORY = '~/.groundcontrol/worktrees'
export const DEFAULT_GIT_DIFF_FILE_LIST_WIDTH = 260

/** Project-terminals panel height bounds (% of the content area, P007 ADR-004). */
export const TERMINAL_PANEL_DEFAULT_PCT = 30
export const TERMINAL_PANEL_MIN_PCT = 15
export const TERMINAL_PANEL_MAX_PCT = 70

/** Clamp a panel height % to its bounds (0.1 precision so drags stay smooth). */
export function clampTerminalPanelPct(v: number): number {
  const clamped = Math.min(TERMINAL_PANEL_MAX_PCT, Math.max(TERMINAL_PANEL_MIN_PCT, v))
  return Math.round(clamped * 10) / 10
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const DEFAULT_SETTINGS: Settings = {
  appThemeId: DEFAULT_APP_THEME_ID,
  terminalThemeId: DEFAULT_TERMINAL_THEME_ID,
  uiHeadingFontFamily: 'unbounded',
  uiHeadingFontSize: 18,
  uiBodyFontFamily: 'system-ui',
  uiBodyFontSize: 13,
  terminalFontFamily: 'jetbrains-mono',
  terminalFontSize: 13,
  terminalBackgroundColor: null,
  terminalBackgroundImage: null,
  terminalBackgroundOpacity: DEFAULT_TERMINAL_BACKGROUND_OPACITY,
  worktreeDirectory: DEFAULT_WORKTREE_DIRECTORY,
  terminalPanelHeightPct: TERMINAL_PANEL_DEFAULT_PCT,
  gitDiffFileListWidth: DEFAULT_GIT_DIFF_FILE_LIST_WIDTH
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)))
}

function pickHeadingId(id: string | undefined): HeadingFontId {
  return id && id in UI_HEADING_FONTS ? (id as HeadingFontId) : 'unbounded'
}

function pickBodyId(id: string | undefined): BodyFontId {
  return id && id in UI_BODY_FONTS ? (id as BodyFontId) : 'system-ui'
}

function pickTerminalId(id: string | undefined): TerminalFontId {
  return id && id in TERMINAL_FONTS ? (id as TerminalFontId) : 'jetbrains-mono'
}

/**
 * ------------------------------------------------
 * Pick a valid AppThemeId from raw settings, migrating legacy `theme` field.
 * @param {Partial<Settings> | undefined} raw - Raw persisted settings
 * @returns {AppThemeId} Migrated app theme id
 */
function pickAppThemeId(raw: Partial<Settings> | undefined): AppThemeId {
  if (raw && isAppThemeId(raw.appThemeId)) return raw.appThemeId
  // Legacy migration: read the old `theme` key
  const legacy = (raw as Record<string, unknown> | undefined)?.theme
  if (legacy === 'light') return 'ground-control-light'
  if (legacy === 'dark' || legacy === 'ember') return 'ground-control-dark'
  return DEFAULT_APP_THEME_ID
}

function pickTerminalThemeId(
  id: unknown,
  appThemeId: AppThemeId,
  fieldPresent: boolean
): TerminalThemeId {
  if (fieldPresent) {
    return isTerminalThemeId(id) ? id : DEFAULT_TERMINAL_THEME_ID
  }
  return appThemeScheme(appThemeId) === 'light' ? 'ember-light' : DEFAULT_TERMINAL_THEME_ID
}

function pickTerminalBackgroundColor(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'string' && HEX_COLOR_RE.test(v)) return v.toLowerCase()
  return null
}

function pickTerminalBackgroundImage(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string' || !isSafeTerminalBgFilename(v)) return null
  return v
}

function pickTerminalBackgroundOpacity(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return DEFAULT_TERMINAL_BACKGROUND_OPACITY
  }
  return clamp(v, 0, 100)
}

/**
 * Pick a persisted panel height %. Clamped here (not consumer-side like
 * `sessionsPaneWidth`) so a hand-edited JSON can't boot a 5%-tall panel
 * (P007 ADR-004); the drag code clamps too.
 */
function pickTerminalPanelHeightPct(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return TERMINAL_PANEL_DEFAULT_PCT
  return clampTerminalPanelPct(v)
}

/**
 * ------------------------------------------------
 * Pick a persisted Git diff file-list width. Clamped to a sensible minimum so
 * hand-edited JSON can't collapse the list entirely; the drag code clamps to
 * the available container.
 * @param {unknown} value - Persisted setting value.
 * @returns {number} Valid width in px.
 */
function pickGitDiffFileListWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_GIT_DIFF_FILE_LIST_WIDTH
  }
  return Math.round(Math.max(180, value))
}

/**
 * ------------------------------------------------
 * Pick a persisted Git diff code font size. Optional: undefined means the diff
 * follows the terminal font size, so a missing value stays undefined (never
 * coerced to a default). A present number is clamped to the terminal bounds.
 * @param {unknown} value - Persisted setting value.
 * @returns {number | undefined} Clamped size in px, or undefined to follow terminal.
 */
function pickGitDiffFontSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return clamp(value, FONT_SIZE_BOUNDS.terminal.min, FONT_SIZE_BOUNDS.terminal.max)
}

/**
 * ------------------------------------------------
 * Pick a persisted worktree directory.
 * @param {unknown} value - Persisted setting value.
 * @returns {string} Non-empty worktree directory.
 */
function pickWorktreeDirectory(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_WORKTREE_DIRECTORY
  const trimmed = value.trim()
  return trimmed || DEFAULT_WORKTREE_DIRECTORY
}

/** Merge partial settings, validate ids, clamp sizes. */
export function normalizeSettings(raw: Partial<Settings> | undefined): Settings {
  const fieldPresent = raw !== undefined && 'terminalThemeId' in raw
  const base = { ...DEFAULT_SETTINGS, ...raw }
  const appThemeId = pickAppThemeId(raw)
  return {
    appThemeId,
    terminalThemeId: pickTerminalThemeId(base.terminalThemeId, appThemeId, fieldPresent),
    sessionsPaneWidth:
      typeof base.sessionsPaneWidth === 'number' && Number.isFinite(base.sessionsPaneWidth)
        ? base.sessionsPaneWidth
        : DEFAULT_SETTINGS.sessionsPaneWidth,
    uiHeadingFontFamily: pickHeadingId(base.uiHeadingFontFamily),
    uiHeadingFontSize: clamp(
      base.uiHeadingFontSize ?? DEFAULT_SETTINGS.uiHeadingFontSize,
      FONT_SIZE_BOUNDS.uiHeading.min,
      FONT_SIZE_BOUNDS.uiHeading.max
    ),
    uiBodyFontFamily: pickBodyId(base.uiBodyFontFamily),
    uiBodyFontSize: clamp(
      base.uiBodyFontSize ?? DEFAULT_SETTINGS.uiBodyFontSize,
      FONT_SIZE_BOUNDS.uiBody.min,
      FONT_SIZE_BOUNDS.uiBody.max
    ),
    terminalFontFamily: pickTerminalId(base.terminalFontFamily),
    terminalFontSize: clamp(
      base.terminalFontSize ?? DEFAULT_SETTINGS.terminalFontSize,
      FONT_SIZE_BOUNDS.terminal.min,
      FONT_SIZE_BOUNDS.terminal.max
    ),
    terminalBackgroundColor: pickTerminalBackgroundColor(base.terminalBackgroundColor),
    terminalBackgroundImage: pickTerminalBackgroundImage(base.terminalBackgroundImage),
    terminalBackgroundOpacity: pickTerminalBackgroundOpacity(base.terminalBackgroundOpacity),
    worktreeDirectory: pickWorktreeDirectory(base.worktreeDirectory),
    terminalPanelHeightPct: pickTerminalPanelHeightPct(base.terminalPanelHeightPct),
    gitDiffFileListWidth: pickGitDiffFileListWidth(base.gitDiffFileListWidth),
    gitDiffFontSize: pickGitDiffFontSize(base.gitDiffFontSize)
  }
}
