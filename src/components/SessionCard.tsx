import { useState } from 'react'
import { useStore } from '@/state/store'
import type { Session, SessionStatus } from '@shared/types'
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
  const requestArchiveSession = useStore((s) => s.requestArchiveSession)
  const renameSession = useStore((s) => s.renameSession)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const isActive = session.id === activeSessionId
  const meta = STATUS[session.status]

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
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-line bg-orange/10 text-cream">
        <AgentIcon agent={session.agent} size={22} />
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
            className="truncate text-body font-semibold"
            title="Double-click to rename"
            onDoubleClick={beginEdit}
          >
            {session.title}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span
            className={`stencil py-[2px] text-[9px] uppercase tracking-[0.08em]${meta.pulse ? ' animate-led-pulse' : ''}`}
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
        </div>
      </div>
      <IconButton
        size="sm"
        tooltip="Archive session"
        onClick={(e) => {
          e.stopPropagation()
          requestArchiveSession(session.id)
        }}
      >
        <Icon name="archive" size={14} />
      </IconButton>
    </Card>
  )
}
