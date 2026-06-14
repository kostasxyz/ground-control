import { useMemo } from 'react'
import { useStore } from '@/state/store'
import { IconButton } from './ui/IconButton'
import { Icon } from './Icon'
import { ProjectDropdown } from './ProjectDropdown'
import { GitControls } from './GitControls'
import { GitChangesBadge } from './GitChangesBadge'
import { CommitDropdown } from './CommitDropdown'

/**
 * ------------------------------------------------
 * Window titlebar with home navigation, project switcher, git controls and
 * settings navigation.
 * @returns {JSX.Element} Titlebar element.
 */
export function Titlebar() {
  const view = useStore((s) => s.view)
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const clearActiveProject = useStore((s) => s.clearActiveProject)
  const setView = useStore((s) => s.setView)
  const showBack = view === 'workspace' || view === 'gitDiff'

  const project = useMemo(
    () => projects.find((p) => p.id === activeProjectId && !p.archived) ?? null,
    [projects, activeProjectId]
  )

  return (
    // pl clears the native traffic lights; data-tauri-drag-region makes the bar a window drag handle
    <div data-tauri-drag-region className="relative flex h-12 shrink-0 items-center border-b border-line bg-(image:--grad-titlebar) pr-4 pl-[90px]">
      {/* pointer-events-none lets clicks on the brand fall through to the drag region */}
      <div className="pointer-events-none mr-[18px] flex shrink-0 items-center gap-0.5 font-display text-heading-2xs font-extrabold tracking-[0.02em]">
        <span className="glow-orange">GROUND</span>
        <span className="text-cream">CONTROL</span>
      </div>
      {showBack && (
        <div className="app-no-drag flex min-w-0 items-center gap-2">
          {/* mr + the 8px gap matches the 18px title-side spacing */}
          <span className="mr-2.5 h-[18px] w-px shrink-0 bg-line" aria-hidden />
          <IconButton tooltip="Home" onClick={clearActiveProject}>
            <Icon name="arrow-left" />
          </IconButton>
          {project && (
            <>
              <ProjectDropdown />
              {/* Perma-disabled: native title (disabled buttons don't hover-trigger tooltips). */}
              <IconButton title="Project settings" aria-label="Project settings" disabled>
                <Icon name="gear" />
              </IconButton>
              <GitControls project={project} />
              <GitChangesBadge />
              <CommitDropdown />
            </>
          )}
        </div>
      )}
      <div className="app-no-drag ml-auto flex items-center gap-2">
        <IconButton
          tooltip={view === 'settings' ? 'Close settings' : 'Settings'}
          onClick={() => setView(view === 'settings' ? (activeProjectId ? 'workspace' : 'welcome') : 'settings')}
        >
          <Icon name="gear" />
        </IconButton>
      </div>
    </div>
  )
}
