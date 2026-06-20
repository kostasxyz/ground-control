import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { CanvasAddon } from '@xterm/addon-canvas'
import { resolveTerminalStack } from '@shared/fonts'
import { useStore } from '@/state/store'
import { buildXtermTheme } from './xtermTheme'
import { registerTerminal, unregisterTerminal } from './registry'

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
    try {
      term.loadAddon(new CanvasAddon())
    } catch {
      /* DOM renderer fallback */
    }
    termRef.current = term
    fitRef.current = fit
    registerTerminal(id, { term, fit, container })

    cbRef.current.setup?.(term)

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

    // fit() on a zero-height container doesn't throw — the FitAddon clamps to
    // its minimum rows/cols and resizes the PTY down with it (collapsed panel
    // → 1-row shells). Only fit when the container has a measurable box; the
    // observer fires again when it regains one.
    const safeFit = (): void => {
      if (!container.clientWidth || !container.clientHeight) return
      try {
        fit.fit()
      } catch {
        /* detached mid-teardown */
      }
    }

    let spawnFitRetries = 0
    const spawnWhenReady = (): void => {
      if (spawnedRef.current || !container.clientWidth || !container.clientHeight) return
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
      if (!container.clientWidth || !container.clientHeight) return
      const width = container.clientWidth
      const height = container.clientHeight
      spawnTimer = setTimeout(() => {
        spawnTimer = null
        if (!alive || spawnedRef.current || !container.clientWidth || !container.clientHeight) return
        if (container.clientWidth !== width || container.clientHeight !== height) {
          queueSpawnWhenReady()
          return
        }
        spawnWhenReady()
      }, 80)
    }
    spawnWhenReadyRef.current = queueSpawnWhenReady

    const ro = new ResizeObserver(() => {
      if (!spawnedRef.current) {
        queueSpawnWhenReady()
        return
      }
      if (!activeRef.current) return
      safeFit()
    })
    ro.observe(container)

    // Fit to the real container, then spawn at the right size. If the container
    // has no measurable box yet (pre-layout, or a collapsed/hidden panel), keep
    // waiting for a stable measurable resize so the PTY doesn't spawn at 80x24
    // or during the dock's opening animation.
    queueSpawnWhenReady()

    return () => {
      alive = false
      if (spawnTimer) clearTimeout(spawnTimer)
      ro.disconnect()
      offData()
      offExit()
      unregisterTerminal(id)
      io.kill(id)
      term.dispose()
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
      if (container && container.clientWidth && container.clientHeight) {
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
