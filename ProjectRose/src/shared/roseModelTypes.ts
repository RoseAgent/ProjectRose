export interface Message {
  role: string
  content: string
}

export interface CostEntry {
  timestamp: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  costUSD: number
}
