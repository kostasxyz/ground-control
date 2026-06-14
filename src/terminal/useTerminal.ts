import { useEffect, useRef } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { AgentId, SpawnMode } from '@shared/types'
import { useXterm, type XtermIo } from './useXterm'

// Alt-screen enable — Claude's TUI emits this when it takes over the screen.
// We use it to reveal the terminal and hide shell-startup noise (PLAN §5.3).
const ALT_SCREEN = '\x1b[?1049h'
// Shift+Enter → legacy Alt+Enter, which Claude treats as "insert newline" (PLAN §5.4).
const SHIFT_ENTER = '\x1b\r'
const REVEAL_FALLBACK_MS = 2500

const sessionIo: XtermIo = {
  write: (id, data) => window.gc.session.write(id, data),
  resize: (id, cols, rows) => window.gc.session.resize(id, cols, rows),
  kill: (id) => window.gc.session.kill(id),
  onData: (cb) => window.gc.session.onData(cb),
  onExit: (cb) => window.gc.session.onExit(cb)
}

export interface TerminalOptions {
  id: string
  cwd: string
  agent: AgentId
  agentSessionId: string | null
  mode: SpawnMode
  active: boolean
  onStarted: () => void
  onReveal: () => void
  onExit: () => void
  onError: (message: string) => void
}

/**
 * An agent session terminal: the shared xterm core (`useXterm`) plus the
 * agent-only layer — spawn over `gc.session`, ALT_SCREEN reveal, Shift+Enter
 * newline, and the reveal fallback timer.
 */
export function useTerminal(opts: TerminalOptions) {
  // Latest callbacks/flags without retriggering anything mount-once.
  const cbRef = useRef(opts)
  cbRef.current = opts

  // Mount-scope reveal state, reset in `setup` (which runs once per xterm mount).
  const aliveRef = useRef(true)
  const revealedRef = useRef(false)
  const tailRef = useRef('')
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { containerRef, fitRef } = useXterm({
    id: opts.id,
    io: sessionIo,
    active: opts.active,

    setup: (term: Terminal) => {
      aliveRef.current = true
      revealedRef.current = false
      tailRef.current = ''
      // Shift+Enter → newline (must run before xterm's default handling).
      term.attachCustomKeyEventHandler((e) => {
        if (
          e.type === 'keydown' &&
          e.key === 'Enter' &&
          e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey
        ) {
          window.gc.session.write(cbRef.current.id, SHIFT_ENTER)
          return false
        }
        return true
      })
    },

    onData: (data) => {
      if (revealedRef.current) return
      // The sequence can straddle two chunks — keep a small overlap tail.
      const hay = tailRef.current + data
      if (hay.includes(ALT_SCREEN)) reveal()
      tailRef.current = hay.slice(-ALT_SCREEN.length)
    },

    onExit: () => {
      cbRef.current.onExit()
    },

    spawn: (cols, rows) => {
      const { id, cwd, agent, agentSessionId, mode } = cbRef.current
      void window.gc.session
        .spawn({ id, cwd, cols, rows, agent, agentSessionId, mode })
        .then((res) => {
          // Unmounted while spawning: the core's cleanup already killed by id and
          // the main process aborts this now-superseded spawn, so don't kill by
          // bare id here — a remount may already own a fresh PTY under the same id.
          if (!aliveRef.current) return
          if (!res.ok) {
            if (res.error === 'superseded') return
            cbRef.current.onError(res.error || 'Failed to start the session.')
            return
          }
          cbRef.current.onStarted()
          revealTimerRef.current = setTimeout(reveal, REVEAL_FALLBACK_MS)
        })
    }
  })

  function reveal(): void {
    if (revealedRef.current) return
    revealedRef.current = true
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
    cbRef.current.onReveal()
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* container not measurable yet */
      }
    })
  }

  // Mirrors the original cleanup: mark dead + drop the pending reveal timer so
  // a spawn resolving after unmount can't fire store actions for a dead session.
  useEffect(() => {
    return () => {
      aliveRef.current = false
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current)
        revealTimerRef.current = null
      }
    }
  }, [])

  return containerRef
}
