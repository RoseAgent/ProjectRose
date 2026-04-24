import { appendFile, readFile, mkdir } from 'fs/promises'
import { prPath } from '../lib/projectPaths'
import type { CostEntry } from '../../shared/roseModelTypes'

export type { CostEntry }

// USD per 1M tokens: [input, output]
const PRICING: Record<string, [number, number]> = {
  // Anthropic
  'claude-3-5-sonnet-20241022': [3.0, 15.0],
  'claude-3-5-haiku-20241022': [0.8, 4.0],
  'claude-3-haiku-20240307': [0.25, 1.25],
  'claude-3-opus-20240229': [15.0, 75.0],
  'claude-sonnet-4-5': [3.0, 15.0],
  'claude-sonnet-4-6': [3.0, 15.0],
  'claude-opus-4-7': [15.0, 75.0],
  'claude-haiku-4-5-20251001': [0.8, 4.0],
  // OpenAI
  'gpt-4o': [2.5, 10.0],
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4-turbo': [10.0, 30.0],
  'gpt-4': [30.0, 60.0],
  'gpt-3.5-turbo': [0.5, 1.5],
  'o1': [15.0, 60.0],
  'o1-mini': [3.0, 12.0],
  'o3-mini': [1.1, 4.4],
  'o3': [10.0, 40.0],
  'o4-mini': [1.1, 4.4],
}

export function calcCostUSD(modelName: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[modelName]
  if (!pricing) return 0
  return (inputTokens * pricing[0] + outputTokens * pricing[1]) / 1_000_000
}

export function hasPricing(modelName: string): boolean {
  return modelName in PRICING
}

const COSTS_DIR = 'costs'
const COST_LOGS_FILE = 'cost-logs.jsonl'

export async function logCostEntry(rootPath: string, entry: CostEntry): Promise<void> {
  const dir = prPath(rootPath, COSTS_DIR)
  await mkdir(dir, { recursive: true })
  await appendFile(prPath(rootPath, COSTS_DIR, COST_LOGS_FILE), JSON.stringify(entry) + '\n', 'utf-8')
}

export async function readCostLogs(rootPath: string): Promise<CostEntry[]> {
  try {
    const raw = await readFile(prPath(rootPath, COSTS_DIR, COST_LOGS_FILE), 'utf-8')
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CostEntry)
  } catch {
    return []
  }
}
