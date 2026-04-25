export interface AgentContext {
  sessionId: string
  agentIndex: number  // 0 = main agent, 1+ = subagents (maps to subagent{index-1}.json)
  rootPath: string
  notify: (channel: string, payload: unknown) => void
  abortSignal?: AbortSignal
}

export interface SubagentCounter {
  value: number
}
