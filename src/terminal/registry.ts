import type { ITheme, Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

interface TerminalEntry {
  term: Terminal
  fit: FitAddon
  container: HTMLElement
  /** Per-terminal font-size override (P007 ADR-007). Broadcasts never clobber
   *  it: null/undefined → follow the global terminalFontSize. */
  fontSizeOverride?: number | null
}

const entries = new Map<string, TerminalEntry>()
let deferred = false
let pending: { fontFamily: string; fontSize: number } | null = null
let pendingTheme: ITheme | null = null

export function registerTerminal(id: string, handles: TerminalEntry): void {
  entries.set(id, handles)
  if (pending) applyToEntry(handles, pending, !deferred && isMeasurable(handles.container))
  // Theme is set at construction too, but re-assert in case it changed between
  // construction and registration (no refit — geometry is unaffected).
  if (pendingTheme) handles.term.options.theme = pendingTheme
}

export function unregisterTerminal(id: string): void {
  entries.delete(id)
}

/**
 * Set (or clear, with null) a terminal's font-size override and apply it.
 * The global broadcast keeps flowing to non-overridden terminals only.
 */
export function setTerminalFontSizeOverride(id: string, size: number | null): void {
  const entry = entries.get(id)
  if (!entry) return
  entry.fontSizeOverride = size
  const fontSize = size ?? pending?.fontSize
  if (fontSize == null || entry.term.options.fontSize === fontSize) return
  entry.term.options.fontSize = fontSize
  if (!isMeasurable(entry.container)) return
  try {
    entry.fit.fit()
  } catch {
    /* hidden / zero-size container */
  }
}

export function setTerminalApplyDeferred(value: boolean): void {
  deferred = value
  if (!deferred && pending) flushTerminalAppearance()
}

export function applyTerminalAppearance(
  opts: { fontFamily: string; fontSize: number },
  options?: { forceFit?: boolean }
): void {
  pending = opts
  const shouldFit = options?.forceFit || !deferred
  for (const entry of entries.values()) {
    applyToEntry(entry, opts, shouldFit)
  }
}

export function flushTerminalAppearance(): void {
  if (!pending) return
  for (const entry of entries.values()) {
    applyToEntry(entry, pending, true)
  }
}

/**
 * Push a new xterm palette to every live terminal. Unlike font changes this
 * needs no `fit()` — cell geometry is unchanged — so it applies immediately
 * even while terminals are hidden (Settings open).
 */
export function applyTerminalTheme(theme: ITheme): void {
  pendingTheme = theme
  for (const { term } of entries.values()) {
    term.options.theme = theme
    term.refresh(0, Math.max(term.rows - 1, 0))
  }
}

function isMeasurable(container: HTMLElement): boolean {
  return container.clientWidth > 0 && container.clientHeight > 0
}

function applyToEntry(
  entry: TerminalEntry,
  opts: { fontFamily: string; fontSize: number },
  shouldFit: boolean
): void {
  const { term, fit, container } = entry
  term.options.fontFamily = opts.fontFamily
  term.options.fontSize = entry.fontSizeOverride ?? opts.fontSize
  if (!shouldFit || !isMeasurable(container)) return
  try {
    fit.fit()
  } catch {
    /* hidden / zero-size container */
  }
}
