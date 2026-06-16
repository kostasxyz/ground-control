import { useEffect } from 'react'
import { useStore } from '@/state/store'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * ------------------------------------------------
 * Confirmation gate for archiving an agent session. Both triggers (the session
 * card's archive button and the console header) call requestArchiveSession,
 * which sets the pending id; this single dialog — mounted at the app root —
 * reads it and runs the archive on confirm.
 * @returns {JSX.Element} Dialog element.
 */
export function ArchiveSessionConfirm() {
  const sessionToArchive = useStore((s) => s.sessionToArchive)
  const sessions = useStore((s) => s.sessions)
  const archiveSession = useStore((s) => s.archiveSession)
  const cancelArchiveSession = useStore((s) => s.cancelArchiveSession)

  const session = sessions.find((s) => s.id === sessionToArchive && !s.archived) ?? null

  useEffect(() => {
    if (sessionToArchive && !session) cancelArchiveSession()
  }, [sessionToArchive, session, cancelArchiveSession])

  return (
    <ConfirmDialog
      open={!!session}
      title="Archive session"
      message={session ? `Archive "${session.title}"?` : ''}
      detail="It's removed from this project's session list and its live terminal is closed."
      confirmLabel="Archive"
      onCancel={cancelArchiveSession}
      onConfirm={() => session && archiveSession(session.id)}
    />
  )
}
