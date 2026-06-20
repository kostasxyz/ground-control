import { useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '@/state/store'
import { selectedWorktreeKey, visibleTerminals } from '@/state/worktreeScope'
import { clampTerminalPanelPct, TERMINAL_PANEL_DEFAULT_PCT } from '@shared/settings'
import { MAX_SHELL_TERMINALS } from '@/lib/constants'
import { useResizeHandle, ResizeHandle } from '@/components/ui/ResizeHandle'
import { Icon } from '@/components/Icon'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { TerminalColumn } from '@/components/TerminalColumn'

/**
 * The "Project Terminals" footer dock (P007): a bar between the body and the
 * status bar, plus a slide-up panel for plain-shell terminals. The persisted
 * height % maps to a flex-grow ratio against the body (both flex-basis-0
 * growers in the .window column), so the panel holds exactly that share of
 * the squeezable space at any window size — no measurement needed. Hidden —
 * not unmounted — outside the workspace view so future PTYs survive
 * (ADR-0008).
 */
export function TerminalDock({ hidden = false }: { hidden?: boolean }) {
  const open = useStore((s) => s.terminalPanelOpen)
  const setOpen = useStore((s) => s.setTerminalPanelOpen)
  const pct = useStore((s) => s.settings.terminalPanelHeightPct)
  const patchSettings = useStore((s) => s.patchSettings)
  const projects = useStore((s) => s.projects)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const shellTerminals = useStore((s) => s.shellTerminals)
  const newShellTerminal = useStore((s) => s.newShellTerminal)
  const trashProjectShellTerminals = useStore((s) => s.trashProjectShellTerminals)
  const focusShellTerminal = useStore((s) => s.focusShellTerminal)
  const focusedShellTerminalId = useStore((s) => s.focusedShellTerminalId)
  const shellExited = useStore((s) => s.shellExited)
  const activatedWorktrees = useStore((s) => s.activatedWorktrees)
  const dragStartRef = useRef({ startPx: 0, area: 0 })

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  )
  const worktreeKey = activeProject ? selectedWorktreeKey(activeProject) : ''
  const projectTerminals = useMemo(
    () =>
      activeProject ? visibleTerminals(shellTerminals, activeProject.id, worktreeKey) : [],
    [shellTerminals, activeProject, worktreeKey]
  )
  // panel/(panel+body) = pct/100 with body at flex "1 1 0" ⇒ grow = pct/(100-pct).
  const grow = clampTerminalPanelPct(pct) / (100 - clampTerminalPanelPct(pct))

  const { onPointerDown, dragging } = useResizeHandle({
    orientation: 'horizontal',
    onDragStart: () => {
      // Fresh measurement at drag start: the squeezable area (body + panel) is
      // invariant while the divider moves, so one read anchors the whole drag.
      const body = document.querySelector<HTMLElement>('[data-app-body]')
      const panel = document.querySelector<HTMLElement>('[data-term-dock-panel]')
      if (!body || !panel) return false
      const area = body.clientHeight + panel.clientHeight
      if (!area) return false
      dragStartRef.current = { startPx: panel.clientHeight, area }
    },
    onMove: (delta) => {
      // Dragging up grows the panel (the divider is its top edge). The hook's
      // raw delta is clientY - startY (positive = down); negate for up-grows.
      const { startPx, area } = dragStartRef.current
      const next = startPx - delta
      patchSettings({ terminalPanelHeightPct: clampTerminalPanelPct((next / area) * 100) })
    }
  })

  return (
    <div
      // The slide: the panel's share is a flex-grow ratio, which animates.
      className={`flex min-h-0 flex-col bg-statusbar ${
        dragging ? 'transition-none' : 'transition-[flex-grow] duration-[160ms] ease-[ease]'
      }`}
      style={
        {
          display: hidden ? 'none' : undefined,
          // Closed: exactly the bar. Open: bar + divider as basis, panel from grow.
          flex: open ? `${grow} 0 41px` : '0 0 40px'
        } as CSSProperties
      }
    >
      {/* Drag handle: the panel's top edge; after:* widens the hit target. */}
      <ResizeHandle
        orientation="horizontal"
        ariaLabel="Resize terminals panel"
        onPointerDown={onPointerDown}
        onDoubleClick={() => patchSettings({ terminalPanelHeightPct: TERMINAL_PANEL_DEFAULT_PCT })}
        style={{ display: open ? undefined : 'none' }}
      />
      <div className="flex h-10 shrink-0 items-center gap-2 border-t border-line px-3">
        <div className="flex shrink-0 items-center gap-2 font-display text-body-2xs font-bold uppercase tracking-[0.08em] text-cream-dim">
          <Icon name="terminal" size={14} className="text-orange" />
          <span>Project Terminals</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {projectTerminals.map((t) => (
            <button
              key={t.id}
              className={`flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border-[0.5px] bg-orange/5 px-[9px] text-body-sm font-semibold transition-all duration-150 hover:bg-orange/13 hover:text-orange-bright ${
                t.id === focusedShellTerminalId
                  ? 'border-orange text-orange-bright shadow-[0_0_8px_-2px_var(--glow)]'
                  : 'border-line text-cream-dim'
              }${t.visible ? '' : ' opacity-55' /* hidden: dimmed chip, PTY still runs */}`}
              title={t.visible ? t.title : `${t.title} (hidden — still running)`}
              onClick={() => {
                setOpen(true)
                focusShellTerminal(t.id) // re-shows the column if hidden (ADR-006)
              }}
            >
              <Icon name="terminal" size={11} className="shrink-0" />
              <span className="max-w-[120px] truncate">{t.title}</span>
              {/* Exited shell: no running dot. */}
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  shellExited[t.id] ? 'bg-line' : 'bg-teal'
                }`}
              />
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {projectTerminals.length > 1 && (
          <Button
            className="mr-2 h-[26px] border-ember/45 bg-ember/8 text-ember hover:not-disabled:border-ember hover:not-disabled:bg-ember/16 hover:not-disabled:text-ember"
            title="Kill all terminals in this worktree"
            onClick={() => trashProjectShellTerminals()}
          >
            <Icon name="trash" size={13} />
            Kill All
          </Button>
        )}
        <Button
          className="h-[26px]"
          disabled={!activeProject || projectTerminals.length >= MAX_SHELL_TERMINALS}
          title={
            projectTerminals.length >= MAX_SHELL_TERMINALS
              ? `Limit of ${MAX_SHELL_TERMINALS} terminals per worktree`
              : 'New terminal'
          }
          onClick={() => newShellTerminal()}
        >
          + New
        </Button>
        <IconButton
          size="sm"
          tooltip={open ? 'Collapse panel' : 'Expand panel'}
          onClick={() => setOpen(!open)}
        >
          <Icon
            name="chevron-down"
            className={`transition-transform duration-150${open ? '' : ' rotate-180'}`}
          />
        </IconButton>
      </div>
      {/* Kept mounted (squeezed to 0 height when collapsed) so terminal PTYs survive. */}
      <div className="flex min-h-0 flex-1 overflow-hidden" data-term-dock-panel>
        {/* Every activated worktree keeps its columns mounted (PTYs alive);
            only the selected worktree's group is displayed (ADR-005). */}
        {activatedWorktrees.map((scope) => {
          const terminals = visibleTerminals(shellTerminals, scope.projectId, scope.cwd)
          // An empty group has no PTYs to keep alive — skip it so the empty
          // notice below is the panel's only child and centers full-width.
          if (terminals.length === 0) return null
          const isVisible =
            scope.projectId === activeProjectId && scope.cwd === worktreeKey
          return (
            <div
              key={`${scope.projectId}:${scope.cwd}`}
              className="flex min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
              data-term-scrollbar
              // Hidden, never unmounted, when another worktree is active — running
              // dev servers survive worktree switches (ADR-005).
              style={{ display: isVisible ? undefined : 'none' }}
            >
              {terminals.map((t) => (
                <TerminalColumn
                  key={t.id}
                  terminal={t}
                  cwd={t.cwd}
                  focused={t.id === focusedShellTerminalId}
                />
              ))}
            </div>
          )
        })}
        {projectTerminals.length === 0 && (
          <div className="flex flex-1 items-center justify-center gap-1.5 p-4 text-body-sm text-cream-dim">
            No terminals yet. <span className="font-mono">+ New</span> opens a shell in this
            project's worktree.
          </div>
        )}
      </div>
    </div>
  )
}
