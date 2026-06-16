import { useState } from 'react'
import type { Project } from '@shared/types'
import { initials } from '@/lib/constants'
import { Icon } from './Icon'
import { Card } from './ui/Card'
import { IconButton } from './ui/IconButton'

interface ProjectCardProps {
  project: Project
  sessionCount: number
  selected: boolean
  pinned: boolean
  onOpen: () => void
  onArchive: () => void
  onDelete: () => void
  onPin: () => void
}

/**
 * ------------------------------------------------
 * Project launch card with pin, archive and delete actions.
 * @param {ProjectCardProps} props - Project card props.
 * @returns {JSX.Element} Project card element.
 */
export function ProjectCard({
  project,
  selected,
  sessionCount,
  pinned,
  onOpen,
  onArchive,
  onDelete,
  onPin,
}: ProjectCardProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <Card
      variant="glow"
      selected={selected}
      className="px-5 py-4"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
    >
      {/* Action buttons — top-right corner */}
      <div className="absolute top-3 right-3 flex gap-1">
        {hovered && (
          <>
            <IconButton
              tooltip="Archive"
              onClick={(e) => {
                e.stopPropagation()
                onArchive()
              }}
            >
              <Icon name="archive" size={14} />
            </IconButton>
            <IconButton
              className="hover:border-ember hover:bg-ember/14 hover:text-ember"
              tooltip="Delete"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <Icon name="trash" size={14} />
            </IconButton>
          </>
        )}
        {/* Pin — always visible */}
        <IconButton
          className={pinned ? 'border-orange/40 bg-orange/10 text-orange hover:bg-orange/20' : ''}
          tooltip={pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
          onClick={(e) => {
            e.stopPropagation()
            onPin()
          }}
        >
          <Icon name={pinned ? 'pin-off' : 'pin'} size={14} />
        </IconButton>
      </div>

      {/* Left color stripe */}
      <div
        className="absolute inset-y-0 left-0 w-1 rounded-l-[10px] opacity-70"
        style={{ backgroundColor: project.color ?? 'var(--orange)' }}
      />

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] font-display text-heading-sm font-extrabold"
          style={{
            background: `${project.color ?? 'var(--orange)'}1a`,
            color: project.color ?? 'var(--orange)',
          }}
        >
          {initials(project.name)}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-body font-semibold text-cream" title={project.path}>
            {project.name}
          </span>
          <span className="text-body-xs text-cream-ghost">
            {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
          </span>
        </div>
      </div>
    </Card>
  )
}
