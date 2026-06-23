import type { Settings } from '@shared/types'
import { appThemeScheme, type AppThemeId } from '@shared/appThemes'
import type { TerminalThemeId } from '@shared/terminalThemes'
import { resolveBodyStack, resolveHeadingStack, resolveTerminalStack } from '@shared/fonts'
import { normalizeSettings } from '@shared/settings'
import {
  isSafeTerminalBgFilename,
  terminalBgAssetUrl,
  terminalBgCssUrl
} from '@shared/terminalBg'
import { ensureFontsForSettings } from '@/lib/fontLoader'
import { applyTerminalAppearance, applyTerminalTheme } from '@/terminal/registry'
import { buildXtermTheme, defaultTerminalBackground } from '@/terminal/xtermTheme'

// --- theme / color scheme (PLAN §10) -----------------------------------------
let lastTerminalThemeId: TerminalThemeId | null = null
let activeTerminalBgImage: string | null = null
const loggedMissingTerminalBgImages = new Set<string>()

/** Push terminal backdrop CSS vars (PLAN §11). */
function applyTerminalChrome(settings: Settings): void {
  const root = document.documentElement
  const background =
    settings.terminalBackgroundColor ?? defaultTerminalBackground(settings.terminalThemeId)

  root.style.setProperty('--term-background', background)
  applyTerminalBgImage(settings.terminalBackgroundImage)
  root.style.setProperty(
    '--term-bg-opacity',
    String(settings.terminalBackgroundOpacity / 100)
  )
}

function applyTerminalBgImage(filename: string | null): void {
  const root = document.documentElement
  if (!filename || !isSafeTerminalBgFilename(filename)) {
    activeTerminalBgImage = null
    root.style.setProperty('--term-bg-image', 'none')
    return
  }

  activeTerminalBgImage = filename
  root.style.setProperty('--term-bg-image', terminalBgCssUrl(filename))
  void probeTerminalBgImage(filename, terminalBgAssetUrl(filename))
}

async function probeTerminalBgImage(filename: string, url: string): Promise<void> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    if (res.ok) return
  } catch {
    /* fall through to degrade */
  }

  if (activeTerminalBgImage !== filename) return

  if (!loggedMissingTerminalBgImages.has(filename)) {
    console.warn(`[appearance] terminal background image not found: ${filename}`)
    loggedMissingTerminalBgImages.add(filename)
  }
  document.documentElement.style.setProperty('--term-bg-image', 'none')
}

/** Swap chrome tokens + native color-scheme; terminal palette is applied separately. */
function applyTheme(id: AppThemeId, settings: Settings): void {
  const scheme = appThemeScheme(id)
  const root = document.documentElement
  root.dataset.theme = scheme // light/dark base swap — tokens.css :root[data-theme='light']
  root.dataset.appTheme = id // full identity — distinct-palette overrides, e.g. :root[data-app-theme='ayu-dark']
  root.style.colorScheme = scheme // native controls / form widgets / scrollbars
  applyTerminalChrome(settings)
}

function applyTerminalPalette(themeId: TerminalThemeId): void {
  if (themeId === lastTerminalThemeId) return
  applyTerminalTheme(buildXtermTheme(themeId))
  lastTerminalThemeId = themeId
}

const APPEARANCE_KEYS = [
  'appThemeId',
  'terminalThemeId',
  'uiHeadingFontFamily',
  'uiHeadingFontSize',
  'uiBodyFontFamily',
  'uiBodyFontSize',
  'terminalFontFamily',
  'terminalFontSize',
  'terminalBackgroundColor',
  'terminalBackgroundImage',
  'terminalBackgroundOpacity',
  // Diff-view appearance: a change here re-runs applyAppearance so the diff
  // font webfont is ensured. The diff CSS vars themselves are set per-render by
  // GitDiffViewer (component-scoped), not here.
  'gitDiffThemeId',
  'gitDiffFontFamily',
  'gitDiffFontSize'
] as const satisfies readonly (keyof Settings)[]

/** True when typography/theme fields changed (not layout-only keys like pane width). */
export function appearanceChanged(before: Settings, after: Settings): boolean {
  return APPEARANCE_KEYS.some((key) => before[key] !== after[key])
}

/** Push appearance settings to :root CSS vars and live terminals. */
export function applyAppearance(raw: Settings): void {
  const settings = normalizeSettings(raw)
  const root = document.documentElement
  void ensureFontsForSettings(settings)

  const headingFamily = resolveHeadingStack(settings.uiHeadingFontFamily)
  const bodyFamily = resolveBodyStack(settings.uiBodyFontFamily)
  const terminalFamily = resolveTerminalStack(settings.terminalFontFamily)
  const headingSize = `${settings.uiHeadingFontSize}px`
  const bodySize = `${settings.uiBodyFontSize}px`

  root.style.setProperty('--font-heading-family', headingFamily)
  root.style.setProperty('--font-heading-size', headingSize)
  root.style.setProperty('--font-body-family', bodyFamily)
  root.style.setProperty('--font-body-size', bodySize)
  // Real monospace var so non-terminal surfaces (e.g. the diff viewer) can share
  // the terminal's font; --mono stays a body-fold back-compat alias.
  root.style.setProperty('--terminal-font', terminalFamily)
  // Paired size var so those surfaces track the terminal's size too, not the UI body.
  root.style.setProperty('--terminal-font-size', `${settings.terminalFontSize}px`)

  // Back-compat aliases (mono/stencil fold into body).
  root.style.setProperty('--display', headingFamily)
  root.style.setProperty('--sf', bodyFamily)
  root.style.setProperty('--mono', bodyFamily)
  root.style.setProperty('--stencil-font', bodyFamily)

  applyTheme(settings.appThemeId, settings)
  applyTerminalPalette(settings.terminalThemeId)

  applyTerminalAppearance({
    fontFamily: terminalFamily,
    fontSize: settings.terminalFontSize
  })
}
