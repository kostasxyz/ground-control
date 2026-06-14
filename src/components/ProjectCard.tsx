import { useState } from 'react'
import type { Project } from '@shared/types'
import { initials } from '@/lib/constants'
import { Card } from './ui/Card'
import { IconButton } from './ui/IconButton'

interface ProjectCardProps {
  project: Project
  sessionCount: number
  selected: boolean
  onOpen: () => void
  onArchive: () => void
  onDelete: () => void
}

/* Hover-action overlay buttons: darker fill than the IconButton default. */
const cardAction = 'h-7 w-7 bg-black/30 text-body-sm'

/**
 * ------------------------------------------------
 * Project launch card with archive and delete actions.
 * @param {ProjectCardProps} props - Project card props.
 * @returns {JSX.Element} Project card element.
 */
export function ProjectCard({
  project,
  selected,
  sessionCount,
  onOpen,
  onArchive,
  onDelete,
}: ProjectCardProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <Card
      variant="glow"
      selected={selected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
    >
      {hovered && (
        <div className="absolute top-2 right-2 flex gap-1">
          <IconButton
            className={cardAction}
            tooltip="Archive"
            onClick={(e) => {
              e.stopPropagation()
              onArchive()
            }}
          >
            📦
          </IconButton>
          <IconButton
            className={`${cardAction} hover:border-ember hover:bg-ember/14 hover:text-ember`}
            tooltip="Delete"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            🗑️
          </IconButton>
        </div>
      )}
      <div
        className="absolute inset-y-0 left-0 w-1 rounded-l-[10px] opacity-70"
        style={{ backgroundColor: project.color ?? 'var(--orange)' }}
      />
      <div className="flex min-w-0 flex-1 gap-2.5">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] font-display text-heading-2xs font-extrabold"
          style={{
            background: `${project.color ?? 'var(--orange)'}1a`,
            color: project.color ?? 'var(--orange)',
          }}
        >
          {initials(project.name)}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-body-sm font-semibold text-cream" title={project.path}>
            {project.name}
          </span>
          <span className="text-body-2xs text-cream-ghost">
            {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
          </span>
        </div>
      </div>
    </Card>
  )
}
