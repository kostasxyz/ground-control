import { useEffect, useRef, useState } from 'react'
import type { ShellTerminal } from '@shared/types'
import { FONT_SIZE_BOUNDS } from '@shared/fonts'
import { useStore } from '@/state/store'
import { useShellTerminal } from '@/terminal/useShellTerminal'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Icon } from '@/components/Icon'
import { Input } from '@/components/ui/Input'

/* Header buttons: bare 24px ghosts — strip IconButton's border/fill, color-only hover. */
const colBtn = 'h-6 w-6 border-0 bg-transparent hover:bg-transparent'

interface Props {
  terminal: ShellTerminal
  /** Worktree the shell starts in, captured from the project at mount. */
  cwd: string
  focused: boolean
}

/**
 * One project shell column in the dock panel (P007): header (title + zoom/
 * rename/trash/hide controls) over the xterm slot. Mounting spawns the PTY;
 * unmounting (trash) kills it (ADR-0008). Hiding keeps it mounted —
 * `display: none` — so the PTY and scrollback survive (ADR-006).
 */
export function TerminalColumn({ terminal, cwd, focused }: Props) {
  const trashShellTerminal = useStore((s) => s.trashShellTerminal)
  const focusShellTerminal = useStore((s) => s.focusShellTerminal)
  const hideShellTerminal = useStore((s) => s.hideShellTerminal)
  const renameShellTerminal = useStore((s) => s.renameShellTerminal)
  const setShellTerminalFontSize = useStore((s) => s.setShellTerminalFontSize)
  const markShellTerminalExited = useStore((s) => s.markShellTerminalExited)
  const clearShellTerminalExited = useStore((s) => s.clearShellTerminalExited)
  const focusSeq = useStore((s) => s.shellFocusSeq)
  const globalFontSize = useStore((s) => s.settings.terminalFontSize)
  const exited = useStore((s) => s.shellExited[terminal.id])

  const { containerRef, respawn } = useShellTerminal({
    id: terminal.id,
    cwd,
    focused,
    focusSeq,
    fontSize: terminal.fontSize,
    onExit: () => markShellTerminalExited(terminal.id, 'exited'),
    onSpawnError: () => markShellTerminalExited(terminal.id, 'spawn-failed')
  })

  // Per-terminal zoom: writes the override only; the global setting and every
  // other terminal stay untouched (ADR-007).
  const { min: sizeMin, max: sizeMax } = FONT_SIZE_BOUNDS.terminal
  const effectiveSize = terminal.fontSize ?? globalFontSize

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(terminal.title)
  const cancelledRef = useRef(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const startEditing = (): void => {
    setDraft(terminal.title)
    cancelledRef.current = false
    setEditing(true)
  }
  const commitRename = (): void => {
    setEditing(false)
    if (!cancelledRef.current) renameShellTerminal(terminal.id, draft)
  }

  return (
    <div
      className="flex min-h-0 min-w-[300px] flex-[1_1_0] flex-col border-line not-first:border-l"
      style={{ display: terminal.visible ? undefined : 'none' }}
      // Capture-phase so a click anywhere in the column (header or xterm)
      // claims focus before xterm's own mouse handling runs. Control buttons
      // and the rename input are exempt — clicking them must not steal the
      // keyboard back to the shell.
      onMouseDownCapture={(e) => {
        if ((e.target as HTMLElement).closest('[data-term-controls], [data-term-rename]')) return
        if (!focused) focusShellTerminal(terminal.id)
      }}
    >
      {/* bg a shade off the dock bar so the header reads as terminal chrome, not more bar */}
      <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-line-soft bg-term-frame pr-1.5 pl-2.5">
        <div
          className={`flex min-w-0 items-center gap-[7px] text-body-sm font-semibold ${
            focused ? 'text-cream' : 'text-cream-dim'
          }`}
        >
          <Icon name="terminal" size={11} className="shrink-0 text-orange" />
          {editing ? (
            <Input
              ref={inputRef}
              data-term-rename
              variant="inline"
              className="h-[22px] min-w-0 flex-1 border-orange px-1.5 text-body-sm"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') {
                  cancelledRef.current = true
                  setEditing(false)
                }
              }}
            />
          ) : (
            <span className="truncate">{terminal.title}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1" data-term-controls>
          <IconButton
            className={colBtn}
            tooltip="Zoom out"
            disabled={effectiveSize <= sizeMin}
            onClick={() => setShellTerminalFontSize(terminal.id, effectiveSize - 1)}
          >
            <Icon name="zoom-out" size={11} />
          </IconButton>
          <IconButton
            className={colBtn}
            tooltip="Zoom in"
            disabled={effectiveSize >= sizeMax}
            onClick={() => setShellTerminalFontSize(terminal.id, effectiveSize + 1)}
          >
            <Icon name="zoom-in" size={11} />
          </IconButton>
          <IconButton className={colBtn} tooltip="Rename terminal" onClick={startEditing}>
            <Icon name="pencil" size={11} />
          </IconButton>
          <IconButton
            className={colBtn}
            tooltip="Trash terminal"
            onClick={() => trashShellTerminal(terminal.id)}
          >
            <Icon name="trash" size={11} />
          </IconButton>
          <IconButton
            className={colBtn}
            tooltip="Hide terminal (keeps it running)"
            onClick={() => hideShellTerminal(terminal.id)}
          >
            <Icon name="close" size={11} />
          </IconButton>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 bg-(--term-background)">
        {/* .term-host scopes the xterm sizing overrides in global.css */}
        <div
          className="term-host relative min-w-0 flex-1 overflow-hidden px-2.5 py-2"
          ref={containerRef}
        />
        {exited && (
          /* Exited shell overlay: notice + Restart over the dead terminal. */
          <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3 bg-[rgba(8,5,3,0.6)] backdrop-blur-[1px]">
            <div className="text-body-sm text-cream-dim">
              {exited === 'spawn-failed' ? 'Shell failed to start.' : 'Shell exited.'}
            </div>
            <Button
              variant="primary"
              onClick={() => {
                clearShellTerminalExited(terminal.id)
                respawn()
              }}
            >
              <span>⟳</span> {exited === 'spawn-failed' ? 'Retry' : 'Restart'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
