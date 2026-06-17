import { useMemo } from 'react'
import { useStore } from '@/state/store'
import { selectedWorktreeKey } from '@/state/worktreeScope'
import { tildeify } from '@/lib/constants'
import { AGENTS } from '@shared/agents'

export function StatusBar() {
  const projects = useStore((s) => s.projects)
  const sessions = useStore((s) => s.sessions)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const agents = useStore((s) => s.agents)
  const homeDir = useStore((s) => s.homeDir)

  const project = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  )
  const session = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  )

  // Show the active session's agent + version; nothing when idle.
  const agentLabel = (() => {
    if (!session) return ''
    const meta = AGENTS[session.agent]
    const info = agents?.[session.agent]
    return info?.found ? `${meta.label} ${info.version ?? ''}`.trim() : `${meta.bin}: not found`
  })()

  const selectedPath = project ? selectedWorktreeKey(project) : null

  return (
    <div className="flex h-[30px] shrink-0 items-center justify-between gap-4 border-t border-line bg-statusbar px-3.5 text-body-2xs text-cream-dim">
      <div className="flex items-center gap-[7px] truncate">
        {project && selectedPath ? (
          <span className="stencil" title={selectedPath}>
            {tildeify(selectedPath, homeDir)}
          </span>
        ) : (
          <span className="opacity-60">No project</span>
        )}
      </div>
      <div className="flex items-center gap-4 truncate">
        {session && <span className="capitalize">{session.status}</span>}
        <span className="font-mono opacity-70">{agentLabel}</span>
      </div>
    </div>
  )
}
