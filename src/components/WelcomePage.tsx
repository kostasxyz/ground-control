import { useStore } from '@/state/store'
import { Button } from './ui/Button'
import { ProjectCard } from './ProjectCard'

/**
 * ------------------------------------------------
 * Project launch page with grid and empty state.
 * @returns {JSX.Element} Welcome page view.
 */
export function WelcomePage() {
  const projects = useStore((s) => s.projects)
  const sessions = useStore((s) => s.sessions)
  const addProject = useStore((s) => s.addProject)
  const selectProject = useStore((s) => s.selectProject)
  const archiveProject = useStore((s) => s.archiveProject)
  const deleteProject = useStore((s) => s.deleteProject)
  const toggleProjectPin = useStore((s) => s.toggleProjectPin)
  const activeProjects = projects.filter((p) => !p.archived)

  if (activeProjects.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-(image:--grad-content)">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="text-heading-display text-orange opacity-80">◇</span>
          <h1 className="font-display text-heading-lg font-bold text-cream">
            Get started with a project
          </h1>
          <p className="max-w-80 text-body leading-[1.6] text-cream-dim">
            Pick a directory to add your first project, then start sessions.
          </p>
          <Button variant="primary" onClick={() => void addProject()}>
            + Add Project
          </Button>
        </div>
      </div>
    )
  }

  const sessionCounts = new Map<string, number>()
  for (const project of activeProjects) {
    sessionCounts.set(project.id, 0)
  }
  for (const session of sessions) {
    if (!session.archived && sessionCounts.has(session.projectId)) {
      sessionCounts.set(session.projectId, sessionCounts.get(session.projectId)! + 1)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-(image:--grad-content)">
      <div className="flex-1 overflow-y-auto p-10">
        <h1 className="mb-6 font-display text-heading-md font-bold text-cream">
          Select project
        </h1>

        {/* Add Project — full-width row */}
        <div className="mb-4">
          <button
            className="relative flex w-full cursor-pointer flex-row items-center justify-center gap-2.5 rounded-[10px] border-[0.5px] border-dashed border-line-soft px-4 py-2.5 text-left transition-all duration-150 hover:border-orange/40 hover:bg-orange/6"
            onClick={() => void addProject()}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-orange/6 font-display text-heading-md font-extrabold text-cream-ghost">
              +
            </span>
            <div className="flex min-w-0 flex-1 gap-2.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-body-sm font-semibold text-cream">
                  Add Project
                </span>
                <span className="text-body-2xs text-cream-ghost">Select a directory</span>
              </div>
            </div>
          </button>
        </div>

        {/* Projects grid */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {activeProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              sessionCount={sessionCounts.get(project.id) ?? 0}
              selected={false}
              pinned={project.pinned ?? false}
              onOpen={() => selectProject(project.id)}
              onArchive={() => archiveProject(project.id)}
              onDelete={() => void deleteProject(project.id)}
              onPin={() => toggleProjectPin(project.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
