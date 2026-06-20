/** Platform-neutral terminal theme catalog (ADR-002). No xterm dependency. */

import type { ColorScheme } from './theme'

export type TerminalThemeId =
  | 'ember-dark'
  | 'ember-light'
  | 'xterm'
  | 'ayu'
  | 'dracula'
  | 'rose-pine'
  | 'rose-pine-dawn'
  | 'matrix'
  | 'claude'
  | 'claude-dark'
  | 'nord'
  | 'nord-light'
  | 'synthwave'
export const TERMINAL_THEME_ORDER = [
  'ember-dark',
  'ember-light',
  'xterm',
  'ayu',
  'dracula',
  'rose-pine',
  'rose-pine-dawn',
  'matrix',
  'claude',
  'claude-dark',
  'nord',
  'nord-light',
  'synthwave'
] as const satisfies readonly TerminalThemeId[]

export const DEFAULT_TERMINAL_THEME_ID: TerminalThemeId = 'ember-dark'

/** Structural palette matching xterm's ITheme fields (opaque background). */
export interface TerminalPalette {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  selectionForeground?: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

const TERMINAL_THEME_LABELS: Record<TerminalThemeId, string> = {
  'ember-dark': 'Ember Dark',
  'ember-light': 'Ember Light',
  xterm: 'xTerm',
  ayu: 'Ayu',
  dracula: 'Dracula',
  'rose-pine': 'Rose Pine',
  'rose-pine-dawn': 'Rose Pine Dawn',
  matrix: 'Matrix',
  claude: 'Claude',
  'claude-dark': 'Claude Dark',
  nord: 'Nord',
  'nord-light': 'Nord Light',
  synthwave: 'Synthwave'
}

const TERMINAL_PALETTES: Record<TerminalThemeId, TerminalPalette> = {
  'ember-dark': {
    background: '#0e0907',
    foreground: '#f3e3d0',
    cursor: '#ff8636',
    cursorAccent: '#1a120c',
    selectionBackground: 'rgba(255, 134, 54, 0.28)',
    selectionForeground: '#1a120c',
    black: '#2c1d13',
    red: '#ff5e3a',
    green: '#9ece6a',
    yellow: '#f5b042',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#5fd6c2',
    white: '#f3e3d0',
    brightBlack: '#aa8f76',
    brightRed: '#ff7d61',
    brightGreen: '#b9f27c',
    brightYellow: '#ffcf6b',
    brightBlue: '#9db4ff',
    brightMagenta: '#d2b6ff',
    brightCyan: '#86e8d8',
    brightWhite: '#fff6ea'
  },
  'ember-light': {
    background: '#fbf3e7',
    foreground: '#2a1c12',
    cursor: '#c25a14',
    cursorAccent: '#fbf3e7',
    selectionBackground: 'rgba(194, 90, 20, 0.24)',
    selectionForeground: '#2a1c12',
    black: '#3a2a1c',
    red: '#c4361b',
    green: '#4f7a1f',
    yellow: '#a9760a',
    blue: '#2f5fb0',
    magenta: '#8a4bc4',
    cyan: '#1f8e7c',
    white: '#5c4a38',
    brightBlack: '#9c8674',
    brightRed: '#d8472a',
    brightGreen: '#5f9128',
    brightYellow: '#bd8410',
    brightBlue: '#3a6fc4',
    brightMagenta: '#9a5bd4',
    brightCyan: '#27a18b',
    brightWhite: '#2a1c12'
  },
  xterm: {
    background: '#000000',
    foreground: '#ffffff',
    cursor: '#ffffff',
    cursorAccent: '#000000',
    selectionBackground: 'rgba(255, 255, 255, 0.3)',
    black: '#000000',
    red: '#cd0000',
    green: '#00cd00',
    yellow: '#cdcd00',
    blue: '#0000ee',
    magenta: '#cd00cd',
    cyan: '#00cdcd',
    white: '#e5e5e5',
    brightBlack: '#7f7f7f',
    brightRed: '#ff0000',
    brightGreen: '#00ff00',
    brightYellow: '#ffff00',
    brightBlue: '#5c5cff',
    brightMagenta: '#ff00ff',
    brightCyan: '#00ffff',
    brightWhite: '#ffffff'
  },
  ayu: {
    background: '#0B0E14',
    foreground: '#BFBDB6',
    cursor: '#E6B450',
    cursorAccent: '#0B0E14',
    selectionBackground: '#409FFF',
    black: '#11151C',
    red: '#EA6C73',
    green: '#7FD962',
    yellow: '#F9AF4F',
    blue: '#53BDFA',
    magenta: '#CDA1FA',
    cyan: '#90E1C6',
    white: '#C7C7C7',
    brightBlack: '#686868',
    brightRed: '#F07178',
    brightGreen: '#AAD94C',
    brightYellow: '#FFB454',
    brightBlue: '#59C2FF',
    brightMagenta: '#D2A6FF',
    brightCyan: '#95E6CB',
    brightWhite: '#FFFFFF'
  },
  dracula: {
    background: '#282A36',
    foreground: '#F8F8F2',
    cursor: '#F8F8F2',
    cursorAccent: '#282A36',
    selectionBackground: '#44475A',
    black: '#21222C',
    red: '#FF5555',
    green: '#50FA7B',
    yellow: '#F1FA8C',
    blue: '#BD93F9',
    magenta: '#FF79C6',
    cyan: '#8BE9FD',
    white: '#F8F8F2',
    brightBlack: '#6272A4',
    brightRed: '#FF6E6E',
    brightGreen: '#69FF94',
    brightYellow: '#FFFFA5',
    brightBlue: '#D6ACFF',
    brightMagenta: '#FF92DF',
    brightCyan: '#A4FFFF',
    brightWhite: '#FFFFFF'
  },
  'rose-pine': {
    background: '#191724',
    foreground: '#E0DEF4',
    cursor: '#E0DEF4',
    cursorAccent: '#191724',
    selectionBackground: '#403D52',
    black: '#26233A',
    red: '#EB6F92',
    green: '#31748F',
    yellow: '#F6C177',
    blue: '#9CCFD8',
    magenta: '#C4A7E7',
    cyan: '#EBBCBA',
    white: '#E0DEF4',
    brightBlack: '#6E6A86',
    brightRed: '#EB6F92',
    brightGreen: '#31748F',
    brightYellow: '#F6C177',
    brightBlue: '#9CCFD8',
    brightMagenta: '#C4A7E7',
    brightCyan: '#EBBCBA',
    brightWhite: '#E0DEF4'
  },
  'rose-pine-dawn': {
    background: '#FAF4ED',
    foreground: '#575279',
    cursor: '#575279',
    cursorAccent: '#FAF4ED',
    selectionBackground: '#DFDAD9',
    black: '#F2E9E1',
    red: '#B4637A',
    green: '#286983',
    yellow: '#EA9D34',
    blue: '#56949F',
    magenta: '#907AA9',
    cyan: '#D7827E',
    white: '#575279',
    brightBlack: '#9893A5',
    brightRed: '#B4637A',
    brightGreen: '#286983',
    brightYellow: '#EA9D34',
    brightBlue: '#56949F',
    brightMagenta: '#907AA9',
    brightCyan: '#D7827E',
    brightWhite: '#575279'
  },
  matrix: {
    background: '#0F191C',
    foreground: '#426644',
    cursor: '#384545',
    cursorAccent: '#00FF00',
    selectionBackground: '#18282E',
    black: '#0F191C',
    red: '#23755A',
    green: '#82D967',
    yellow: '#FFD700',
    blue: '#3F5242',
    magenta: '#409931',
    cyan: '#50B45A',
    white: '#507350',
    brightBlack: '#688060',
    brightRed: '#2FC079',
    brightGreen: '#90D762',
    brightYellow: '#FAFF00',
    brightBlue: '#4F7E7E',
    brightMagenta: '#11FF25',
    brightCyan: '#C1FF8A',
    brightWhite: '#678C61'
  },
  claude: {
    background: '#FAF9F5',
    foreground: '#141413',
    cursor: '#D97757',
    cursorAccent: '#FAF9F5',
    selectionBackground: '#E8E6DC',
    selectionForeground: '#141413',
    black: '#C15F3C',
    red: '#788C5D',
    green: '#B16803',
    yellow: '#6A9BCC',
    blue: '#8B6CB0',
    magenta: '#2E8B8B',
    cyan: '#B5B3A9',
    white: '#3D3D3C',
    brightBlack: '#D97757',
    brightRed: '#8FA86B',
    brightGreen: '#D4952B',
    brightYellow: '#7BAFD4',
    brightBlue: '#A080C8',
    brightMagenta: '#4EAAAA',
    brightCyan: '#BAB9B5',
    brightWhite: '#141413'
  },
  'claude-dark': {
    background: '#1A1A1E',
    foreground: '#E8E6DC',
    cursor: '#D97757',
    cursorAccent: '#1A1A1E',
    selectionBackground: '#35353A',
    selectionForeground: '#E8E6DC',
    black: '#2A2A2E',
    red: '#C15F3C',
    green: '#788C5D',
    yellow: '#B16803',
    blue: '#6A9BCC',
    magenta: '#8B6CB0',
    cyan: '#2E8B8B',
    white: '#B5B3A9',
    brightBlack: '#5A5A5E',
    brightRed: '#D97757',
    brightGreen: '#D4952B',
    brightYellow: '#7BAFD4',
    brightBlue: '#A080C8',
    brightMagenta: '#4EAAAA',
    brightCyan: '#CAC8C0',
    brightWhite: '#F5F3EE'
  },
  // Nord — arctic, north-bluish palette (Polar Night / Snow Storm / Frost /
  // Aurora). Dark sibling of the Nord family. Anchors: background #2E3440
  // (nord0), foreground #D8DEE9 (nord4), frost #88C0D0. The canonical Nord
  // 16-colour scheme.
  nord: {
    background: '#2E3440',
    foreground: '#D8DEE9',
    cursor: '#ECEFF4',
    cursorAccent: '#2E3440',
    selectionBackground: '#ECEFF4',
    selectionForeground: '#4C566A',
    black: '#3B4252',
    red: '#BF616A',
    green: '#A3BE8C',
    yellow: '#EBCB8B',
    blue: '#81A1C1',
    magenta: '#B48EAD',
    cyan: '#88C0D0',
    white: '#E5E9F0',
    brightBlack: '#4C566A',
    brightRed: '#BF616A',
    brightGreen: '#A3BE8C',
    brightYellow: '#EBCB8B',
    brightBlue: '#81A1C1',
    brightMagenta: '#B48EAD',
    brightCyan: '#8FBCBB',
    brightWhite: '#ECEFF4'
  },
  // Nord Light — light sibling of the Nord family. Snow-storm background
  // #E5E9F0 (nord5) with the same Frost/Aurora accents; flips with the OS
  // scheme alongside the dark Nord variant.
  'nord-light': {
    background: '#E5E9F0',
    foreground: '#414858',
    cursor: '#88C0D0',
    cursorAccent: '#3B4252',
    selectionBackground: '#D8DEE9',
    selectionForeground: '#4C566A',
    black: '#3B4252',
    red: '#BF616A',
    green: '#A3BE8C',
    yellow: '#EBCB8B',
    blue: '#81A1C1',
    magenta: '#B48EAD',
    cyan: '#88C0D0',
    white: '#D8DEE9',
    brightBlack: '#4C566A',
    brightRed: '#BF616A',
    brightGreen: '#A3BE8C',
    brightYellow: '#EBCB8B',
    brightBlue: '#81A1C1',
    brightMagenta: '#B48EAD',
    brightCyan: '#8FBCBB',
    brightWhite: '#ECEFF4'
  },
  // Synthwave — electronic neon-on-black 80s retrowave palette. Pure black
  // background, hot pink #F6188F primary, cyan #19CDE6 cursor/selection.
  // Dark-only (no light sibling).
  synthwave: {
    background: '#000000',
    foreground: '#DAD9C7',
    cursor: '#19CDE6',
    cursorAccent: '#000000',
    selectionBackground: '#19CDE6',
    selectionForeground: '#000000',
    black: '#000000',
    red: '#F6188F',
    green: '#1EBB2B',
    yellow: '#FDF834',
    blue: '#2186EC',
    magenta: '#F85A21',
    cyan: '#12C3E2',
    white: '#FFFFFF',
    brightBlack: '#7F7094',
    brightRed: '#F841A0',
    brightGreen: '#25C141',
    brightYellow: '#FDF454',
    brightBlue: '#2F9DED',
    brightMagenta: '#F97137',
    brightCyan: '#19CDE6',
    brightWhite: '#FFFFFF'
  }
}

export function isTerminalThemeId(v: unknown): v is TerminalThemeId {
  return typeof v === 'string' && v in TERMINAL_PALETTES
}

export function terminalThemeLabel(id: TerminalThemeId): string {
  return TERMINAL_THEME_LABELS[id]
}

export function terminalThemePalette(id: TerminalThemeId): TerminalPalette {
  return TERMINAL_PALETTES[id]
}

export function defaultTerminalBackground(id: TerminalThemeId): string {
  return TERMINAL_PALETTES[id].background
}

export function defaultTerminalForeground(id: TerminalThemeId): string {
  return TERMINAL_PALETTES[id].foreground
}

/** Relative luminance (0..1) of a `#rrggbb` colour; 0 if unparseable. */
function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * Whether a terminal theme reads as dark (used to pick a light/dark syntax
 * scheme for surfaces that follow the terminal theme, e.g. the diff viewer).
 */
export function terminalThemeIsDark(id: TerminalThemeId): boolean {
  return relativeLuminance(TERMINAL_PALETTES[id].background) < 0.5
}

/**
 * The scheme's default terminal theme: the first catalog entry whose palette
 * matches the scheme (Ember Dark / Ember Light). Used as the off-pair fallback
 * when an OS light/dark flip re-pairs the terminal (app/terminal pairing).
 */
export function defaultTerminalThemeForScheme(scheme: ColorScheme): TerminalThemeId {
  return (
    TERMINAL_THEME_ORDER.find((id) => terminalThemeIsDark(id) === (scheme === 'dark')) ??
    DEFAULT_TERMINAL_THEME_ID
  )
}
