import { useState } from 'react'
import { useStore } from '@/state/store'
import type { Session, SessionStatus } from '@shared/types'
import { AGENTS } from '@shared/agents'
import { PLACEHOLDER_TITLE } from '@/lib/constants'
import { Icon } from './Icon'
import { Card } from './ui/Card'
import { IconButton } from './ui/IconButton'
import { Input } from './ui/Input'
import { AgentIcon } from './AgentIcon'

const STATUS: Record<SessionStatus, { label: string; color: string; pulse: boolean }> = {
  pending: { label: 'Starting', color: 'var(--orange)', pulse: true },
  running: { label: 'Running', color: 'var(--teal)', pulse: true },
  idle: { label: 'Parked', color: 'var(--gold)', pulse: false },
  exited: { label: 'Ended', color: 'var(--cream-ghost)', pulse: false }
}

export function SessionCard({ session }: { session: Session }) {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const selectSession = useStore((s) => s.selectSession)
  const archiveSession = useStore((s) => s.archiveSession)
  const renameSession = useStore((s) => s.renameSession)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const isActive = session.id === activeSessionId
  const meta = STATUS[session.status]
  const isPlaceholder = session.title === PLACEHOLDER_TITLE

  const beginEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraft(session.title)
    setEditing(true)
  }
  const commit = () => {
    renameSession(session.id, draft)
    setEditing(false)
  }

  return (
    <Card variant="matte" selected={isActive} onClick={() => selectSession(session.id)}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border-[0.5px] border-line bg-orange/10 text-body text-orange">
        <AgentIcon agent={session.agent} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {editing ? (
          <Input
            variant="inline"
            className="w-full"
            value={draft}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              else if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <div
            className={`truncate text-body font-semibold${isPlaceholder ? ' italic glow-orange' : ''}`}
            title="Double-click to rename"
            onDoubleClick={beginEdit}
          >
            {session.title}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span
            className="stencil inline-flex items-center gap-1.5 rounded-full px-[9px] py-[2px] text-body-xs uppercase"
            style={{ color: meta.color }}
          >
            <span
              className={`inline-block h-[7px] w-[7px] rounded-full shadow-[0_0_8px_currentColor]${meta.pulse ? ' animate-led-pulse' : ''}`}
            />
            {meta.label}
          </span>
          <span className="rounded-full border-[0.5px] border-line px-2 py-px font-stencil text-body-xs uppercase tracking-[0.08em] text-cream-ghost">
            {AGENTS[session.agent].label}
          </span>
        </div>
      </div>
      <IconButton
        size="sm"
        tooltip="Archive session"
        onClick={(e) => {
          e.stopPropagation()
          archiveSession(session.id)
        }}
      >
        <Icon name="archive" size={14} />
      </IconButton>
    </Card>
  )
}
