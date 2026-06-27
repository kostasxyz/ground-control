// Agent registry — the pure, platform-neutral facts shared by renderer + main.
// Each agent CLI differs mainly in how it's located and how a session id is
// acquired; the *behavioral* adapters live in electron/main/agents.ts. This file
// owns only what both sides need: the id/label/bin and the id strategy.

export type AgentId = 'claude' | 'pi' | 'codex' | 'opencode' | 'cursor' | 'droid'

// How a session's resumable id comes to exist:
//  - assign   : we mint it and pass it on first launch        (claude --session-id)
//  - precreate: a side command/API makes it before launch     (cursor, codex)
//  - fresh    : no official precreate/resume-by-id path; launch a new run
export type IdStrategy = 'assign' | 'precreate' | 'fresh'

export interface AgentMeta {
  id: AgentId
  label: string
  bin: string
  idStrategy: IdStrategy
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  claude: { id: 'claude', label: 'Claude', bin: 'claude', idStrategy: 'assign' },
  pi: { id: 'pi', label: 'Pi', bin: 'pi', idStrategy: 'assign' },
  codex: { id: 'codex', label: 'Codex', bin: 'codex', idStrategy: 'precreate' },
  opencode: { id: 'opencode', label: 'OpenCode', bin: 'opencode', idStrategy: 'fresh' },
  cursor: { id: 'cursor', label: 'Cursor', bin: 'cursor-agent', idStrategy: 'precreate' },
  droid: { id: 'droid', label: 'Droid', bin: 'droid', idStrategy: 'fresh' }
}

/** Dialog order — Claude (the default) first, then Pi, then the rest. */
export const AGENT_ORDER: AgentId[] = ['claude', 'pi', 'codex', 'opencode', 'cursor', 'droid']

export function isAgentId(x: unknown): x is AgentId {
  return typeof x === 'string' && x in AGENTS
}
