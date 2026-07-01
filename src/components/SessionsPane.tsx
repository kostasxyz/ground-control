import { useMemo } from 'react'
import { useStore } from '@/state/store'
import { selectedWorktreeKey, visibleSessions } from '@/state/worktreeScope'
import { Button } from './ui/Button'
import { Icon } from './Icon'
import { SessionCard } from './SessionCard'
import { NewSessionDialog } from './NewSessionDialog'

export function SessionsPane() {
  const projects = useStore((s) => s.projects)
  const sessions = useStore((s) => s.sessions)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const agents = useStore((s) => s.agents)
  const openNewSession = useStore((s) => s.openNewSession)
  const addProject = useStore((s) => s.addProject)

  const project = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  )
  const projectSessions = useMemo(() => {
    if (!project) return []
    const worktreeKey = selectedWorktreeKey(project)
    return visibleSessions(sessions, project.id, worktreeKey).sort(
      (a, b) => b.createdAt - a.createdAt
    )
  }, [sessions, project])

  // Width is drag-controlled via --sessions-w (ContentSplit); @container/sessions
  // lets the card grid react to the panel's own width, not the viewport.
  const paneClass =
    'flex min-w-[220px] flex-[0_1_var(--sessions-w,360px)] flex-col @container/sessions'

  if (!project) {
    return (
      <div className={paneClass}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-heading-display text-orange opacity-80">◇</div>
          <div className="font-display text-heading-sm font-bold text-cream">No project yet</div>
          <div className="max-w-[280px] text-body leading-[1.6] text-cream-dim">
            Add a directory to start managing durable Claude sessions inside it.
          </div>
          <Button variant="primary" onClick={() => void addProject()}>
            <span>+</span> Add a project
          </Button>
        </div>
      </div>
    )
  }

  const noAgents = !!agents && !Object.values(agents).some((a) => a.found)

  return (
    <div className={paneClass}>
      <NewSessionDialog />

      <div className="pane-header gap-3 px-4">
        <h2 className="min-w-0 truncate font-display text-heading-sm font-bold text-orange">
          {project.name}
        </h2>
        <Button
          variant="ctrl"
          onClick={openNewSession}
          disabled={noAgents}
          title={noAgents ? 'No agent CLIs found' : 'Start a new session'}
          aria-label="New session"
          className="shrink-0 border-line/70 bg-transparent text-cream-dim hover:not-disabled:bg-transparent"
        >
          <Icon name="plus" size={13} /> New session
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-2 pt-5 pb-4 pl-4">
        {noAgents && (
          <div className="rounded-lg border-[0.5px] border-ember/40 bg-ember/8 px-[11px] py-2 text-body-sm leading-normal text-ember">
            No agent CLIs were found on your PATH. Install one of{' '}
            <span className="font-mono">claude</span>, <span className="font-mono">codex</span>,{' '}
            <span className="font-mono">opencode</span>, or <span className="font-mono">cursor-agent</span>{' '}
            and restart the app.
          </div>
        )}

        {projectSessions.length === 0 && !noAgents && (
          <div className="px-0.5 py-1.5 text-body-sm-plus leading-[1.6] text-cream-dim">
            No sessions yet. Start one to launch an agent in{' '}
            <span className="font-mono">{project.name}</span>.
          </div>
        )}

        {projectSessions.length > 0 && (
          <div className="grid grid-cols-1 gap-3 @min-[560px]/sessions:grid-cols-2 @min-[1920px]/sessions:grid-cols-3">
            {projectSessions.map((s) => (
              <SessionCard key={s.id} session={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
