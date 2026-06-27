import { useRef } from 'react'
import { AGENT_ORDER, AGENTS } from '@shared/agents'
import { useStore } from '@/state/store'
import { AgentIcon } from './AgentIcon'
import { Icon } from './Icon'
import { Dialog } from './ui/Dialog'

/**
 * The agent picker (PLAN 003). Opened by "+ New session"; choosing an available
 * agent creates a session bound to it. Missing CLIs are shown disabled. Shell
 * on ui/Dialog parts; the store stays the owner of the open state (ADR-008-01:
 * the primitive is controlled, this component passes `open` down).
 */
export function NewSessionDialog() {
  const open = useStore((s) => s.newSessionOpen)
  const agents = useStore((s) => s.agents)
  const newSession = useStore((s) => s.newSession)
  const close = useStore((s) => s.closeNewSession)
  const pendingAgent = useStore((s) => s.newSessionPendingAgent)
  const error = useStore((s) => s.newSessionError)
  const firstRef = useRef<HTMLButtonElement | null>(null)

  const firstAvailable = AGENT_ORDER.find((id) => agents?.[id]?.found)
  const busy = !!pendingAgent

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close()
      }}
    >
      {/* Initial focus pinned to the first selectable agent for keyboard users. */}
      <Dialog.Popup aria-label="Choose an agent" initialFocus={firstRef}>
        <Dialog.Header>
          <Dialog.Title>New session</Dialog.Title>
          {!busy && <Dialog.CloseX />}
        </Dialog.Header>
        <Dialog.Description>Choose an agent CLI to launch in this project.</Dialog.Description>

        <div className="grid grid-cols-1 gap-2">
          {AGENT_ORDER.map((id) => {
            const meta = AGENTS[id]
            const info = agents?.[id]
            const found = !!info?.found
            const pending = pendingAgent === id
            return (
              <button
                key={id}
                ref={found && id === firstAvailable ? firstRef : undefined}
                className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-[9px] border-[0.5px] border-line bg-orange/5 px-3 py-2.5 text-left transition-all duration-150 hover:not-disabled:border-orange/45 hover:not-disabled:bg-orange/10 focus-visible:not-disabled:border-orange/45 focus-visible:not-disabled:bg-orange/10 focus-visible:outline-none disabled:cursor-default disabled:opacity-40"
                disabled={!found || busy}
                aria-busy={pending}
                title={
                  found
                    ? pending
                      ? `Creating a ${meta.label} session`
                      : `Start a ${meta.label} session`
                    : `${meta.bin} not found on PATH`
                }
                onClick={() => void newSession(id)}
              >
                    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border-[0.5px] border-line bg-orange/10 text-body-sm text-cream">
                  {pending ? (
                    <Icon name="refresh-cw" size={17} className="animate-spin" />
                  ) : (
                    <AgentIcon agent={id} size={18} />
                  )}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body font-semibold text-cream">{meta.label}</span>
                  <span className="truncate font-mono text-body-2xs text-cream-ghost">
                    {found ? info?.version ?? meta.bin : `${meta.bin} · not found`}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {error && (
          <div className="mt-3 rounded-[8px] border-[0.5px] border-ember/35 bg-ember/10 px-3 py-2 text-body-xs leading-[1.45] text-cream-dim">
            {error}
          </div>
        )}
      </Dialog.Popup>
    </Dialog.Root>
  )
}
