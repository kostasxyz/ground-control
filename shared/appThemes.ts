/** Platform-neutral app-theme catalog (ADR-0018). No DOM/xterm dependency — compiles in both tsconfigs (main + renderer). */

import type { ColorScheme } from './theme'
import type { TerminalThemeId } from './terminalThemes'

export type AppThemeId = 'ground-control-dark' | 'ground-control-light' | 'ayu-dark' | 'rose-pine' | 'rose-pine-dawn' | 'matrix' | 'claude' | 'claude-dark' | 'nord' | 'nord-light' | 'synthwave'

export type AppThemeFamily = 'ground-control' | 'ayu' | 'rose-pine' | 'matrix' | 'claude' | 'nord' | 'synthwave'

export const APP_THEME_ORDER = [
  'ground-control-dark',
  'ground-control-light',
  'ayu-dark',
  'rose-pine',
  'rose-pine-dawn',
  'matrix',
  'claude',
  'claude-dark',
  'nord',
  'nord-light',
  'synthwave'
] as const satisfies readonly AppThemeId[]

export const DEFAULT_APP_THEME_ID: AppThemeId = 'ground-control-dark'

/** Structural descriptor for an app color theme. */
export interface AppTheme {
  label: string
  family: AppThemeFamily
  scheme: ColorScheme
  /** Terminal theme selected alongside this app theme. Picking the app theme
   *  switches the terminal to this; an OS flip keeps an in-sync pair together. */
  terminalPair: TerminalThemeId
  /** Base surface color, mirroring `--surface` in tokens.css. Used by the native
   *  layer (window backgroundColor) and the pre-paint seed — places that can't
   *  read CSS vars — to paint the right color before the renderer themes itself. */
  surface: string
}

const APP_THEMES: Record<AppThemeId, AppTheme> = {
  'ground-control-dark': {
    label: 'Ground Control Dark',
    family: 'ground-control',
    scheme: 'dark',
    terminalPair: 'ember-dark',
    surface: '#241811'
  },
  'ground-control-light': {
    label: 'Ground Control Light',
    family: 'ground-control',
    scheme: 'light',
    terminalPair: 'ember-light',
    surface: '#fcf5ea'
  },
  // Distinct palette (not a ground-control recolor) — overrides land on a
  // separate CSS axis: tokens.css :root[data-app-theme='ayu-dark']. Dark-only,
  // so pairedAppTheme() keeps it when the OS flips to light (no ayu-light sibling).
  'ayu-dark': {
    label: 'Ayu Dark',
    family: 'ayu',
    scheme: 'dark',
    terminalPair: 'ayu',
    surface: '#0e131b'
  },
  // Rose Pine family — dark/light pair with distinct palettes. The dark sibling
  // is the original Rose Pine; the light sibling is Rose Pine Dawn. They flip
  // with the OS scheme, same as the ground-control family.
  'rose-pine': {
    label: 'Rose Pine',
    family: 'rose-pine',
    scheme: 'dark',
    terminalPair: 'rose-pine',
    surface: '#1f1d2e'
  },
  'rose-pine-dawn': {
    label: 'Rose Pine Dawn',
    family: 'rose-pine',
    scheme: 'light',
    terminalPair: 'rose-pine-dawn',
    surface: '#fffaf3'
  },
  // Matrix — green-on-black distinct palette. Dark-only, so pairedAppTheme()
  // keeps it when the OS flips to light (no matrix-light sibling). Green accent
  // (#82D967) anchors the UI.
  'matrix': {
    label: 'Matrix',
    family: 'matrix',
    scheme: 'dark',
    terminalPair: 'matrix',
    surface: '#152228'
  },
  // Claude family — warm palette inspired by Claude AI's brand. Dark/light
  // pair that flips with the OS scheme. Terracotta orange (#D97757) accent
  // anchors the UI.
  'claude': {
    label: 'Claude',
    family: 'claude',
    scheme: 'light',
    terminalPair: 'claude',
    surface: '#fffbf8'
  },
  'claude-dark': {
    label: 'Claude Dark',
    family: 'claude',
    scheme: 'dark',
    terminalPair: 'claude-dark',
    surface: '#222226'
  },
  // Nord family — arctic, north-bluish palette. Dark/light pair that flips
  // with the OS scheme, same as the ground-control and rose-pine families.
  // Frost #88C0D0 anchors the dark UI; Snow Storm #ECEFF4 the light UI.
  nord: {
    label: 'Nord',
    family: 'nord',
    scheme: 'dark',
    terminalPair: 'nord',
    surface: '#3B4252'
  },
  'nord-light': {
    label: 'Nord Light',
    family: 'nord',
    scheme: 'light',
    terminalPair: 'nord-light',
    surface: '#ECEFF4'
  },
  // Synthwave — electronic neon-on-black 80s retrowave palette. Dark-only, so
  // pairedAppTheme() keeps it when the OS flips to light (no synthwave-light
  // sibling). Hot pink (#F6188F) accent anchors the UI.
  synthwave: {
    label: 'Synthwave',
    family: 'synthwave',
    scheme: 'dark',
    terminalPair: 'synthwave',
    surface: '#0A0A0E'
  }
}

export function isAppThemeId(v: unknown): v is AppThemeId {
  return typeof v === 'string' && v in APP_THEMES
}

export function appThemeLabel(id: AppThemeId): string {
  return APP_THEMES[id].label
}

export function appThemeScheme(id: AppThemeId): ColorScheme {
  return APP_THEMES[id].scheme
}

/** Base surface color for a theme — for the native window bg and pre-paint seed. */
export function appThemeSurface(id: AppThemeId): string {
  return APP_THEMES[id].surface
}

/**
 * ------------------------------------------------
 * Within the same family, find the theme whose scheme matches.
 * Falls back to `id` when no sibling matches (e.g. only one variant).
 * @param {AppThemeId} id - Current theme id
 * @param {ColorScheme} scheme - Desired color scheme
 * @returns {AppThemeId} Best-matching theme
 */
export function pairedAppTheme(id: AppThemeId, scheme: ColorScheme): AppThemeId {
  const current = APP_THEMES[id]
  if (current.scheme === scheme) return id
  for (const [tid, t] of Object.entries(APP_THEMES)) {
    if (t.family === current.family && t.scheme === scheme) {
      return tid as AppThemeId
    }
  }
  return id
}

/** The terminal theme paired with an app theme (selected together). */
export function appThemeTerminalPair(id: AppThemeId): TerminalThemeId {
  return APP_THEMES[id].terminalPair
}

/**
 * Whether the terminal theme is the app theme's designated pair — i.e. they are
 * "in sync" (selected together, not independently customized). Drives whether an
 * OS light/dark flip carries the terminal along with the app theme.
 */
export function isTerminalPairInSync(id: AppThemeId, terminalThemeId: TerminalThemeId): boolean {
  return APP_THEMES[id].terminalPair === terminalThemeId
}
