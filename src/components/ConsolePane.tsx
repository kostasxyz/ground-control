import { useMemo } from 'react'
import { AGENTS } from '@shared/agents'
import { useStore } from '@/state/store'
import { selectedWorktreeKey, visibleTerminals } from '@/state/worktreeScope'
import { FONT_SIZE_BOUNDS } from '@shared/fonts'
import { TerminalView } from '@/terminal/TerminalView'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Icon } from '@/components/Icon'

export function ConsolePane() {
  const sessions = useStore((s) => s.sessions)
  const liveIds = useStore((s) => s.liveIds)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const errors = useStore((s) => s.errors)
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)
  const selectSession = useStore((s) => s.selectSession)
  const requestArchiveSession = useStore((s) => s.requestArchiveSession)
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const shellTerminals = useStore((s) => s.shellTerminals)
  const newShellTerminal = useStore((s) => s.newShellTerminal)
  const setTerminalPanelOpen = useStore((s) => s.setTerminalPanelOpen)
  const terminalPanelOpen = useStore((s) => s.terminalPanelOpen)

  const { min: termMin, max: termMax } = FONT_SIZE_BOUNDS.terminal
  const termSize = settings.terminalFontSize

  const active = useMemo(
    () => sessions.find((s) => s.id === activeSessionId && !s.archived) ?? null,
    [sessions, activeSessionId]
  )

  // Toggle the project-terminals dock; when opening an empty project/worktree,
  // spawn a first shell (newShellTerminal already flips terminalPanelOpen on).
  const projectTerminals = useMemo(() => {
    const project = projects.find((p) => p.id === activeProjectId)
    if (!project) return []
    return visibleTerminals(shellTerminals, project.id, selectedWorktreeKey(project))
  }, [projects, activeProjectId, shellTerminals])

  const toggleProjectTerminals = () => {
    if (!activeProjectId) return
    if (terminalPanelOpen) {
      setTerminalPanelOpen(false)
    } else if (projectTerminals.length === 0) {
      newShellTerminal()
    } else {
      setTerminalPanelOpen(true)
    }
  }
  const activeIsLive = !!activeSessionId && liveIds.includes(activeSessionId)
  const activeError = activeSessionId ? errors[activeSessionId] : undefined
  const activeCanResume =
    !!active && AGENTS[active.agent].idStrategy !== 'fresh' && !!active.agentSessionId

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="pane-header pr-3 pl-4">
        <div className={`truncate text-body font-semibold${active ? ' glow-orange' : ''}`}>
          {active ? active.title : 'No session selected'}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton
            className="h-6 w-6 border-0 bg-transparent hover:bg-transparent"
            tooltip="Zoom in"
            disabled={termSize >= termMax}
            onClick={() => patchSettings({ terminalFontSize: termSize + 1 })}
          >
            <Icon name="zoom-in" size={11} />
          </IconButton>
          <IconButton
            className="h-6 w-6 border-0 bg-transparent hover:bg-transparent"
            tooltip="Zoom out"
            disabled={termSize <= termMin}
            onClick={() => patchSettings({ terminalFontSize: termSize - 1 })}
          >
            <Icon name="zoom-out" size={11} />
          </IconButton>
          <IconButton
            className="h-6 w-6 border-0 bg-transparent hover:bg-transparent"
            tooltip={terminalPanelOpen ? 'Hide terminals' : 'Terminals'}
            disabled={!activeProjectId}
            onClick={toggleProjectTerminals}
          >
            <Icon name="terminal" size={11} />
          </IconButton>
          <span className="mx-1 h-[18px] w-px shrink-0 bg-line" aria-hidden />
          <IconButton
            className="h-6 w-6 border-0 bg-transparent hover:bg-transparent"
            tooltip="Archive session"
            style={{ color: 'var(--ember)' }}
            disabled={!active}
            onClick={() => active && requestArchiveSession(active.id)}
          >
            <Icon name="archive" size={11} />
          </IconButton>
        </div>
      </div>

      {/* Terminal chrome layers (PLAN §11): backdrop (after) → image (before) → cells */}
      <div className="relative m-3 min-h-0 flex-1 overflow-hidden rounded-[10px] border-[0.5px] border-line bg-term-frame shadow-[inset_0_1px_0_rgba(255,168,96,0.05)] after:pointer-events-none after:absolute after:inset-0 after:z-0 after:bg-(--term-background) before:pointer-events-none before:absolute before:inset-0 before:z-[1] before:bg-(image:--term-bg-image) before:bg-cover before:bg-center before:bg-no-repeat before:opacity-(--term-bg-opacity)">
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
