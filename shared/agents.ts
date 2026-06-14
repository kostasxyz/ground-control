// Agent registry — the pure, platform-neutral facts shared by renderer + main.
// Each agent CLI differs mainly in how it's located and how a session id is
// acquired; the *behavioral* adapters live in electron/main/agents.ts. This file
// owns only what both sides need: the id/label/bin and the id strategy.

export type AgentId = 'claude' | 'codex' | 'opencode' | 'cursor'

// How a session's resumable id comes to exist:
//  - assign   : we mint it and pass it on first launch        (claude --session-id)
//  - precreate: a side command makes it before launch         (cursor create-chat)
//  - discover : the CLI mints it on the first message; we read it back off disk
//               (codex rollout, opencode storage)
export type IdStrategy = 'assign' | 'precreate' | 'discover'

export interface AgentMeta {
  id: AgentId
  label: string
  bin: string
  idStrategy: IdStrategy
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  claude: { id: 'claude', label: 'Claude', bin: 'claude', idStrategy: 'assign' },
  codex: { id: 'codex', label: 'Codex', bin: 'codex', idStrategy: 'discover' },
  opencode: { id: 'opencode', label: 'OpenCode', bin: 'opencode', idStrategy: 'discover' },
  cursor: { id: 'cursor', label: 'Cursor', bin: 'cursor-agent', idStrategy: 'precreate' }
}

/** Dialog order — Claude (the default) first, then the rest. */
export const AGENT_ORDER: AgentId[] = ['claude', 'codex', 'opencode', 'cursor']

export function isAgentId(x: unknown): x is AgentId {
  return typeof x === 'string' && x in AGENTS
}
