import { useCallback, useEffect, useRef } from 'react'
import { useXterm, type XtermIo } from './useXterm'
import { setTerminalFontSizeOverride } from './registry'

const terminalIo: XtermIo = {
  write: (id, data) => window.gc.terminal.write(id, data),
  resize: (id, cols, rows) => window.gc.terminal.resize(id, cols, rows),
  kill: (id) => window.gc.terminal.kill(id),
  onData: (cb) => window.gc.terminal.onData(cb),
  onExit: (cb) => window.gc.terminal.onExit(cb)
}

export interface ShellTerminalOptions {
  id: string
  cwd: string
  /** Owns keyboard focus (outlined tab). All visible columns refit regardless. */
  focused: boolean
  /** Bumped per explicit focus action — refocuses even when `focused` didn't flip. */
  focusSeq: number
  /** Per-terminal font-size override; null follows the global setting (ADR-007). */
  fontSize: number | null
  onExit?: () => void
  onSpawnError?: (message: string) => void
}

/**
 * A plain project shell terminal (P007): the shared xterm core over
 * `gc.terminal`. No reveal dance — a shell prompt is immediately visible
 * content — and no agent spawn plan; the PTY is a `zsh -il` in the project
 * worktree.
 */
export function useShellTerminal(opts: ShellTerminalOptions) {
  const cbRef = useRef(opts)
  cbRef.current = opts

  const doSpawn = useCallback((cols: number, rows: number) => {
    const { id, cwd } = cbRef.current
    void window.gc.terminal.spawn({ id, cwd, cols, rows }).then((res) => {
      if (!res.ok && res.error !== 'superseded') {
        const message = res.error || 'Failed to start the shell.'
        // No status machine for shells: surface the failure in the terminal.
        termRef.current?.writeln(`\x1b[31m${message}\x1b[0m`)
        cbRef.current.onSpawnError?.(message)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { containerRef, termRef } = useXterm({
    id: opts.id,
    // `active` gates the core's ResizeObserver refit; every mounted shell
    // column must refit when the panel resizes, so it's always on — the core
    // skips fits while the container has no measurable box (collapsed panel,
    // hidden column/project group).
    active: true,
    // Focus is explicit-only here (the focusSeq effect below) — without this,
    // always-on `active` would grab the keyboard on every column mount.
    focusOnActive: false,
    io: terminalIo,
    onExit: () => cbRef.current.onExit?.(),
    spawn: doSpawn
  })

  /** Re-spawn a fresh shell under the same id (the exited→Restart affordance). */
  const respawn = useCallback(() => {
    const term = termRef.current
    if (!term) return
    // Clear the dead shell's scrollback so the fresh shell doesn't stack under
    // the previous session's output.
    term.reset()
    doSpawn(term.cols, term.rows)
  }, [doSpawn, termRef])

  // Land the cursor in this shell on explicit focus actions — focusSeq bumps
  // (tab/column click, + New). Passive `focused` flips (project switch handing
  // over the outline) must not steal the keyboard.
  useEffect(() => {
    if (!opts.focused) return
    const raf = requestAnimationFrame(() => termRef.current?.focus())
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.focusSeq])

  // Apply the per-terminal font-size override; the registry keeps it across
  // global font broadcasts (ADR-007).
  useEffect(() => {
    setTerminalFontSizeOverride(opts.id, opts.fontSize)
  }, [opts.id, opts.fontSize])

  return { containerRef, respawn }
}
