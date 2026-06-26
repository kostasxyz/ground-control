import type { Session } from '@shared/types'
import { useStore } from '@/state/store'
import { useTerminal } from './useTerminal'

interface Props {
  session: Session
  active: boolean
}

/**
 * One live terminal. Stays mounted (hidden when inactive) so switching is
 * instant; unmounting tears the PTY down. Bridges terminal lifecycle events
 * back into the store.
 */
export function TerminalView({ session, active }: Props) {
  const markStarted = useStore((s) => s.markStarted)
  const markRunning = useStore((s) => s.markRunning)
  const markExited = useStore((s) => s.markExited)
  const setError = useStore((s) => s.setError)

  const ref = useTerminal({
    id: session.id,
    cwd: session.cwd,
    agent: session.agent,
    agentSessionId: session.agentSessionId,
    mode: session.started ? 'resume' : 'new',
    active,
    onStarted: () => markStarted(session.id),
    onReveal: () => markRunning(session.id),
    onExit: () => markExited(session.id),
    onError: (message) => setError(session.id, message)
  })

  // OpenCode paints its own opaque, edge-to-edge background. Two things would
  // otherwise leak the chrome image around it: (1) the usual inner padding, and
  // (2) the sub-cell remainder on the right/bottom that the terminal grid never
  // covers. So for OpenCode we drop the padding and give the host an opaque
  // backdrop, so the remainder shows the solid backdrop instead of the image.
  const isOpencode = session.agent === 'opencode'
  const hostPadding = isOpencode ? '' : ' px-2.5 py-2'

  return (
    <div className="absolute inset-0 z-[2] flex" style={{ display: active ? 'flex' : 'none' }}>
      {/* .term-host scopes the xterm sizing overrides in global.css */}
      <div
        className={`term-host relative min-w-0 flex-1 overflow-hidden${hostPadding}`}
        style={isOpencode ? { backgroundColor: 'var(--term-background)' } : undefined}
        ref={ref}
      />
    </div>
  )
}
