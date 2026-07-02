import { useMemo } from 'react'
import { AGENTS } from '@shared/agents'
import { useStore } from '@/state/store'
import { TerminalView } from '@/terminal/TerminalView'
import { Button } from '@/components/ui/Button'

export function ConsolePane() {
  const sessions = useStore((s) => s.sessions)
  const liveIds = useStore((s) => s.liveIds)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const errors = useStore((s) => s.errors)
  const selectSession = useStore((s) => s.selectSession)

  const active = useMemo(
    () => sessions.find((s) => s.id === activeSessionId && !s.archived) ?? null,
    [sessions, activeSessionId]
  )

  const activeIsLive = !!activeSessionId && liveIds.includes(activeSessionId)
  const activeError = activeSessionId ? errors[activeSessionId] : undefined
  const activeCanResume =
    !!active && AGENTS[active.agent].idStrategy !== 'fresh' && !!active.agentSessionId

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Terminal chrome layers (PLAN §11): backdrop (after) → image (before) → cells */}
      <div className="relative min-h-0 flex-1 overflow-hidden border-[0.5px] border-line bg-term-frame after:pointer-events-none after:absolute after:inset-0 after:z-0 after:bg-(--term-background) before:pointer-events-none before:absolute before:inset-0 before:z-[1] before:bg-(image:--term-bg-image) before:bg-cover before:bg-center before:bg-no-repeat before:opacity-(--term-bg-opacity)">
        {liveIds.map((id) => {
          const session = sessions.find((s) => s.id === id)
          if (!session || session.archived) return null
          return (
            <TerminalView
              key={id}
              session={session}
              active={id === activeSessionId}
            />
          )
        })}

        {!activeSessionId && (
          <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3.5 p-6 text-center text-cream-dim">
            <div className="font-mono text-heading-lg text-orange opacity-80">❯_</div>
            <div className="max-w-80 text-body leading-[1.6]">
              Select a session, or start a new one to launch an agent here.
            </div>
          </div>
        )}

        {activeSessionId && !activeIsLive && active && (
          <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3.5 p-6 text-center text-cream-dim">
            <div className="font-mono text-heading-lg text-orange opacity-80">
              {activeError ? '⚠' : '❯_'}
            </div>
            <div className="max-w-80 text-body leading-[1.6]">
              {activeError
                ? activeError
                : active.status === 'exited'
                  ? activeCanResume
                    ? 'This session ended. Resume to reattach to the conversation.'
                    : 'This session ended. Start a new run to continue with this agent.'
                  : activeCanResume
                    ? 'This session is parked. Resume to reattach to the conversation.'
                    : 'This session is parked. Start a new run to continue with this agent.'}
            </div>
            {!activeError && (
              <Button variant="primary" onClick={() => selectSession(active.id)}>
                <span>⟳</span> {activeCanResume ? 'Resume session' : 'Start new run'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
