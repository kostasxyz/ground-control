import type { ITheme } from '@xterm/xterm'
import {
  defaultTerminalBackground as defaultTerminalBackgroundFor,
  defaultTerminalForeground as defaultTerminalForegroundFor,
  terminalThemePalette,
  type TerminalThemeId
} from '@shared/terminalThemes'

const TRANSPARENT_BACKGROUND = 'rgba(0, 0, 0, 0)'

/** Selected theme default terminal backdrop (PLAN §11 — CSS chrome layer). */
export function defaultTerminalBackground(themeId: TerminalThemeId): string {
  return defaultTerminalBackgroundFor(themeId)
}

export function defaultTerminalForeground(themeId: TerminalThemeId): string {
  return defaultTerminalForegroundFor(themeId)
}

/** Base palette with transparent canvas so CSS chrome shows through (PLAN §11). */
export function buildXtermTheme(themeId: TerminalThemeId): ITheme {
  return {
    ...terminalThemePalette(themeId),
    background: TRANSPARENT_BACKGROUND
  }
}
