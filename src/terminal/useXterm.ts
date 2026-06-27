import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { CanvasAddon } from '@xterm/addon-canvas'
import { resolveTerminalStack } from '@shared/fonts'
import { useStore } from '@/state/store'
import { TERMINAL_PANEL_ANIM_MS } from '@/lib/constants'
import { buildXtermTheme } from './xtermTheme'
import { registerTerminal, unregisterTerminal } from './registry'

// Shift+Enter inserts a newline instead of submitting. ESC+CR is the
// "Alt/Option+Enter" sequence most agent CLIs (Claude, Codex, …) treat as
// "insert newline"; harmless in a plain shell. The default unless a terminal
// overrides it via `newlineSeq` (pi and droid read the kitty Shift+Enter CSI — useTerminal).
const DEFAULT_NEWLINE = '\x1b\r'
const LAYOUT_SETTLE_BUFFER_MS = 40
const LAYOUT_SETTLE_MS = TERMINAL_PANEL_ANIM_MS + LAYOUT_SETTLE_BUFFER_MS

/**
 * ------------------------------------------------
 * Check that the terminal host and its ancestors have a visible layout box.
 * @param {HTMLElement} element - Terminal host element.
 * @returns {boolean} True when fitting can use the real visible size.
 */
function hasMeasurableLayout(element: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.clientWidth <= 0 || current.clientHeight <= 0) return false
    if (current === document.body) return true
  }
  return false
}

/**
 * ------------------------------------------------
 * Collect the terminal host and ancestors that can reveal or clip it.
 * @param {HTMLElement} element - Terminal host element.
 * @returns {HTMLElement[]} Elements to watch for layout changes.
 */
function layoutObserverElements(element: HTMLElement): HTMLElement[] {
  const elements: HTMLElement[] = []
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    elements.push(current)
    if (current === document.body) break
  }
  return elements
}

/** How a terminal's bytes get to and from its PTY (gc.session.* or gc.terminal.*). */
export interface XtermIo {
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  onData(cb: (e: { id: string; data: string }) => void): () => void
  onExit(cb: (e: { id: string; exitCode: number; signal?: number }) => void): () => void
}

export interface XtermOptions {
  id: string
  io: XtermIo
  active: boolean
  /** Grab the keyboard when `active` flips true (default). Shell columns keep
   *  `active` always-on for refits and own focus themselves (shellFocusSeq),
   *  so they opt out — otherwise every column mount would steal the cursor. */
  focusOnActive?: boolean
  /** Write PTY output into the xterm. Return value feeds nothing; callers tap
   *  the stream for their own needs (e.g. agent reveal detection). */
  onData?: (data: string) => void
  onExit?: () => void
  /**
   * Spawn the PTY once the xterm is fitted; receives the real cols/rows.
   * Runs exactly once per mount. Cleanup kills by id (mount↔PTY 1:1, ADR-0008).
   */
  spawn: (cols: number, rows: number) => void
  /** Hook xterm setup before the PTY exists (key handlers etc.). */
  setup?: (term: Terminal) => void
  /** Bytes written on Shift+Enter to insert a newline. Defaults to ESC+CR;
   *  agents that read a different sequence (pi, droid) override it. */
  newlineSeq?: string
  /** Bytes written on ⌘V (macOS) when the clipboard holds an image, so the
   *  mac-native paste shortcut also pastes screenshots. The agent reads the OS
   *  clipboard itself on receipt (Claude/pi use ^V = \x16). Unset → ⌘V stays
   *  text-only (shells, and agents without clipboard image paste). */
  imagePasteSeq?: string
}

export interface XtermHandles {
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  termRef: React.MutableRefObject<Terminal | null>
  fitRef: React.MutableRefObject<FitAddon | null>
}

/**
 * The agent-agnostic xterm mount core (P007 ADR-003): construct + fit +
 * ResizeObserver + write/resize wiring + registry registration, parameterized
 * by an io adapter. Owns one xterm for the component's lifetime; spawns on
 * mount, kills on unmount — the store controls the PTY purely by mounting.
 * Agent-only behavior (reveal/ALT_SCREEN/transcript) stays in `useTerminal`.
 */
export function useXterm(opts: XtermOptions): XtermHandles {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const spawnedRef = useRef(false)
  const spawnWhenReadyRef = useRef<() => void>(() => {})

  // Latest callbacks/flags without re-running the once-only mount effect.
  const cbRef = useRef(opts)
  cbRef.current = opts
  const activeRef = useRef(opts.active)
  activeRef.current = opts.active

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const { id, io } = cbRef.current

    let alive = true
    spawnedRef.current = false

    const { terminalFontFamily, terminalFontSize, terminalThemeId } =
      useStore.getState().settings

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: resolveTerminalStack(terminalFontFamily),
      fontSize: terminalFontSize,
      fontWeight: 500,
      fontWeightBold: 700,
      // 1.0 — taller line-heights mis-measured cell height and broke OpenCode's
      // output layout (the original opencode glitch).
      lineHeight: 1.0,
      letterSpacing: 0,
      // Draw block-element/box-drawing glyphs (TUI logos, borders) programmatically
      // so they tile cell-to-cell instead of leaving HiDPI row seams. Only takes
      // effect with the canvas renderer below — the DOM renderer ignores it.
      customGlyphs: true,
      scrollback: 5000,
      allowTransparency: true,
      theme: buildXtermTheme(terminalThemeId)
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    // Canvas renderer: tiles block/box glyphs cleanly (kills the HiDPI row seams
    // the DOM renderer leaves in TUI logos/borders) and, unlike WebGL, honors
    // allowTransparency so the chrome image still shows through. If it can't
    // initialize, xterm stays on the DOM renderer.
    let canvasAddon: CanvasAddon | null = null
    try {
      canvasAddon = new CanvasAddon()
      term.loadAddon(canvasAddon)
    } catch {
      canvasAddon = null /* DOM renderer fallback */
    }
    termRef.current = term
    fitRef.current = fit
    registerTerminal(id, { term, fit, container })

    cbRef.current.setup?.(term)

    // Global terminal keymaps for every terminal — agent and shell alike.
    // Runs before xterm's default key handling.
    const isMac = window.gc.system.platform === 'darwin'
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true

      // Shift+Enter → insert a newline instead of submitting. Byte sequence is
      // per-terminal: ESC+CR by default (what Claude/Codex/… read as "newline"),
      // or `newlineSeq` for agents with their own (pi, droid → the kitty
      // Shift+Enter CSI). preventDefault so the off-screen helper textarea doesn't also keep
      // a stray newline.
      if (e.key === 'Enter' && e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        io.write(id, cbRef.current.newlineSeq ?? DEFAULT_NEWLINE)
        return false
      }

      // Copy/paste using each OS's native terminal convention:
      //   macOS:         ⌘C / ⌘V
      //   Linux/Windows: Ctrl+Shift+C / Ctrl+Shift+V — so plain Ctrl+C still
      //                  sends SIGINT and plain Ctrl+V stays the shell's
      //                  literal-next (^V).
      const clipMod = isMac
        ? e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
        : e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey
      if (clipMod) {
        const key = e.key.toLowerCase()
        // Copy: xterm holds its selection in its own render layer (invisible to
        // the DOM), so the browser's native copy can't see it — do it by hand,
        // and preventDefault so the native (empty) copy can't clobber it. With
        // no selection, pass through (a harmless no-op).
        if (key === 'c') {
          const selection = term.getSelection()
          if (!selection) return true
          e.preventDefault()
          void navigator.clipboard?.writeText(selection).catch(() => {})
          return false
        }
        if (key === 'v') {
          // macOS ⌘V is the browser's native paste binding: return false to stop
          // xterm re-emitting the key and let the native paste event flow into
          // xterm's own handler (bracketed paste) for TEXT. Don't preventDefault.
          if (isMac) {
            // ⌘V also pastes images. The native text paste is a no-op for an
            // image-only clipboard (no text/plain), so when the clipboard holds
            // an image and this agent can paste one, forward its image-paste
            // sequence — the agent reads the OS clipboard itself. Async, so it
            // runs after the synchronous return; clipboard.read() unavailable or
            // denied just falls back to the agent's own Ctrl+V.
            const imageSeq = cbRef.current.imagePasteSeq
            if (imageSeq && navigator.clipboard?.read) {
              void navigator.clipboard
                .read()
                .then((items) => {
                  if (items.some((it) => it.types.some((t) => t.startsWith('image/'))))
                    io.write(id, imageSeq)
                })
                .catch(() => {})
            }
            return false
          }
          // Ctrl+Shift+V is NOT a native paste binding, so read the clipboard
          // ourselves and feed xterm's bracketed paste. preventDefault guards
          // against any native paste also firing (no double paste).
          e.preventDefault()
          void navigator.clipboard
            ?.readText()
            .then((text) => {
              if (text) term.paste(text)
            })
            .catch(() => {})
          return false
        }
      }

      return true
    })

    const offData = io.onData((e) => {
      if (!alive || e.id !== id) return
      term.write(e.data)
      cbRef.current.onData?.(e.data)
    })
    const offExit = io.onExit((e) => {
      if (!alive || e.id !== id) return
      cbRef.current.onExit?.()
    })

    term.onData((d) => io.write(id, d))
    term.onResize(({ cols, rows }) => io.resize(id, cols, rows))

    // fit() on a zero-height/clipped container doesn't throw — the FitAddon
    // clamps to its minimum rows/cols and resizes the PTY down with it
    // (collapsed panel → 1-row shells). Only fit when the container and its
    // ancestors have measurable boxes; the observer fires again when visible.
    const safeFit = (): void => {
      if (!hasMeasurableLayout(container)) return
      try {
        fit.fit()
      } catch {
        /* detached mid-teardown */
      }
    }

    let spawnFitRetries = 0
    const spawnWhenReady = (): void => {
      if (spawnedRef.current || !hasMeasurableLayout(container)) return
      safeFit()
      if (term.rows <= 1 && spawnFitRetries < 20) {
        spawnFitRetries += 1
        queueSpawnWhenReady()
        return
      }
      spawnedRef.current = true
      cbRef.current.spawn(term.cols, term.rows)
    }

    let spawnTimer: ReturnType<typeof setTimeout> | null = null
    const queueSpawnWhenReady = (): void => {
      if (spawnedRef.current) return
      if (spawnTimer) {
        clearTimeout(spawnTimer)
        spawnTimer = null
      }
      if (!hasMeasurableLayout(container)) return
      const width = container.clientWidth
      const height = container.clientHeight
      spawnTimer = setTimeout(() => {
        spawnTimer = null
        if (!alive || spawnedRef.current || !hasMeasurableLayout(container)) return
        if (container.clientWidth !== width || container.clientHeight !== height) {
          queueSpawnWhenReady()
          return
        }
        spawnWhenReady()
      }, LAYOUT_SETTLE_MS)
    }
    spawnWhenReadyRef.current = queueSpawnWhenReady

    // Refit only on a settled size. The dock animates its height (flex-grow over
    // the shared TERMINAL_PANEL_ANIM_MS) when the Project Terminals panel toggles,
    // and a divider drag streams sizes continuously; fitting on every intermediate
    // frame walked the live PTY down to ~1 row and back, making shells reprint their
    // prompt on each toggle (the "terminals respawn on pane toggle" bug). Waiting
    // for quiescence means a collapse settles at 0 (skipped — PTY keeps its rows)
    // and the matching expand fits back to the same rows → no resize, no reprint.
    let fitTimer: ReturnType<typeof setTimeout> | null = null
    const queueFit = (): void => {
      if (fitTimer) clearTimeout(fitTimer)
      if (!hasMeasurableLayout(container)) return
      const width = container.clientWidth
      const height = container.clientHeight
      fitTimer = setTimeout(() => {
        fitTimer = null
        if (!alive || !hasMeasurableLayout(container)) return
        // Still moving (mid-animation/drag) — wait for the size to settle so the
        // PTY only ever resizes to a steady layout, never a transient frame.
        if (container.clientWidth !== width || container.clientHeight !== height) {
          queueFit()
          return
        }
        safeFit()
      }, LAYOUT_SETTLE_MS)
    }

    const ro = new ResizeObserver(() => {
      if (!spawnedRef.current) {
        queueSpawnWhenReady()
        return
      }
      if (!activeRef.current) return
      queueFit()
    })
    for (const element of layoutObserverElements(container)) ro.observe(element)

    // Fit to the real container, then spawn at the right size. If the container
    // has no measurable box yet (pre-layout, or a collapsed/hidden panel), keep
    // waiting for a stable measurable resize so the PTY doesn't spawn at 80x24
    // or during the dock's opening animation.
    queueSpawnWhenReady()

    return () => {
      alive = false
      if (spawnTimer) clearTimeout(spawnTimer)
      if (fitTimer) clearTimeout(fitTimer)
      ro.disconnect()
      offData()
      offExit()
      unregisterTerminal(id)
      io.kill(id)
      // Dispose the CanvasAddon BEFORE the terminal: Terminal.dispose() otherwise
      // tears it down last, and on this xterm/addon-canvas combo that path tries
      // to re-create a DOM renderer on a half-disposed core and throws
      // ("onShowLinkUnderline" of undefined). An uncaught throw here unmounts the
      // whole React root — that's the "Kill All → blank screen" hang. Guarded so
      // teardown can never propagate (it's already a throwaway terminal).
      try {
        canvasAddon?.dispose()
      } catch {
        /* renderer already torn down */
      }
      try {
        term.dispose()
      } catch {
        /* defensive: never let teardown blank the app */
      }
      termRef.current = null
      fitRef.current = null
      spawnWhenReadyRef.current = () => {}
    }
    // Mount-once: terminal identity is fixed for this component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refit + focus when this terminal becomes the active one.
  useEffect(() => {
    if (!opts.active || opts.focusOnActive === false) return
    const raf = requestAnimationFrame(() => {
      spawnWhenReadyRef.current()
      const container = containerRef.current
      if (container && hasMeasurableLayout(container)) {
        try {
          fitRef.current?.fit()
        } catch {
          /* not measurable */
        }
      }
      termRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.active])

  return { containerRef, termRef, fitRef }
}
