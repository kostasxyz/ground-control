import { useMemo } from 'react'
import { useStore } from '@/state/store'
import { IconButton } from './ui/IconButton'
import { Icon } from './Icon'
import { ProjectDropdown } from './ProjectDropdown'
import { GitControls } from './GitControls'
import { GitChangesBadge } from './GitChangesBadge'
import { CommitDropdown } from './CommitDropdown'
import { OpenDirDropdown } from './OpenDirDropdown'

/**
 * ------------------------------------------------
 * Full-width (100vw) workspace controls bar that sits between the titlebar and
 * the body. Holds the project switcher and the per-project git controls lifted
 * out of the titlebar. The "+ New session" action lives in the sessions pane
 * header (top-right of the sidebar).
 * @returns {JSX.Element} Workspace bar element.
 */
export function WorkspaceBar() {
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)

  const project = useMemo(
    () => projects.find((p) => p.id === activeProjectId && !p.archived) ?? null,
    [projects, activeProjectId]
  )

  return (
    <div className="flex h-11 w-full shrink-0 items-center gap-2 border-b border-line bg-(image:--grad-content) px-4">
      <ProjectDropdown />

      {project && (
        <>
          <span className="mx-1 h-[18px] w-px shrink-0 bg-line" aria-hidden />
          {/* Perma-disabled: native title (disabled buttons don't hover-trigger tooltips). */}
          <IconButton title="Project settings" aria-label="Project settings" disabled>
            <Icon name="gear" />
          </IconButton>
          <OpenDirDropdown dir={project.activeWorktreePath ?? project.path} />
          <GitControls project={project} />
          <GitChangesBadge />
          <CommitDropdown />
        </>
      )}
    </div>
  )
}
