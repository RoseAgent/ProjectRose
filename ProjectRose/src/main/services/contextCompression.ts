import { generateText } from 'ai'
import type { ModelConfig } from './settingsService'
import { resolveModel } from './modelResolution'

// Renderer-shaped message: structural subset of the renderer's ChatMessage union.
// Defined here as Record<string, unknown> to avoid an import cycle with the
// renderer module — fields are pulled out by name with runtime checks.
type RendererMessage = Record<string, unknown>

// Output shape sent to the LLM. Matches what the renderer's buildApiMessages
// produces from settled renderer messages.
export interface ApiShapeMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Number of trailing turns left untouched by compression. A "turn" starts at a
// user message and ends just before the next user message (or end of list).
// Holding back the recent two means the model still sees the active back-and-forth
// verbatim while older history collapses into summaries.
const KEEP_RECENT_TURNS = 2

interface Turn {
  // Indices into the input renderer-message array, inclusive.
  start: number
  end: number
  // Indices into the api-shape view (post-filter to user/assistant/injected).
  apiStart: number
  apiEnd: number
}

function isApiShape(role: unknown): role is 'user' | 'assistant' | 'injected' {
  return role === 'user' || role === 'assistant' || role === 'injected'
}

function rendererToApi(m: RendererMessage): ApiShapeMessage | null {
  const role = m.role
  const content = typeof m.content === 'string' ? m.content : ''
  if (role === 'user') return { role: 'user', content }
  if (role === 'assistant') return { role: 'assistant', content }
  if (role === 'injected') {
    const extName = typeof m.extensionName === 'string' ? m.extensionName : 'extension'
    return { role: 'system', content: `[Extension ${extName}] ${content}` }
  }
  return null
}

// Walk renderer messages and produce one Turn per user message. The first turn
// covers any leading non-user messages too (shouldn't normally happen, but if
// the session starts with system/injected content it still gets grouped).
function splitIntoTurns(messages: RendererMessage[]): Turn[] {
  const turns: Turn[] = []
  let currentStart = 0
  let currentApiStart = 0
  let apiIdx = 0
  let started = false

  for (let i = 0; i < messages.length; i++) {
    const role = messages[i].role
    if (role === 'user') {
      if (started) {
        turns.push({
          start: currentStart,
          end: i - 1,
          apiStart: currentApiStart,
          apiEnd: apiIdx - 1,
        })
      }
      currentStart = i
      currentApiStart = apiIdx
      started = true
    }
    if (isApiShape(role)) apiIdx++
  }
  if (started) {
    turns.push({
      start: currentStart,
      end: messages.length - 1,
      apiStart: currentApiStart,
      apiEnd: apiIdx - 1,
    })
  }
  return turns
}

// Build a compact text representation of one old turn that the summarizer can
// digest. Mentions tools used (with success/error) so the summary can name them
// even though tool messages never round-trip to the LLM in normal chat.
function describeTurnForSummary(messages: RendererMessage[], turn: Turn): string {
  const lines: string[] = []
  for (let i = turn.start; i <= turn.end; i++) {
    const m = messages[i]
    const role = m.role
    const content = typeof m.content === 'string' ? m.content : ''
    if (role === 'user') {
      lines.push(`USER: ${content}`)
    } else if (role === 'assistant') {
      if (content.trim().length > 0) lines.push(`ASSISTANT: ${content}`)
    } else if (role === 'tool') {
      const name = typeof m.name === 'string' ? m.name : 'tool'
      const error = m.error === true
      const result = typeof m.result === 'string' ? m.result : ''
      const snippet = result.length > 200 ? result.slice(0, 200) + '…' : result
      lines.push(`TOOL ${name}${error ? ' (error)' : ''}: ${snippet}`)
    } else if (role === 'ask_user') {
      const q = typeof m.question === 'string' ? m.question : ''
      const a = typeof m.answer === 'string' ? m.answer : ''
      lines.push(`ASK_USER: ${q} → ${a}`)
    } else if (role === 'injected') {
      const extName = typeof m.extensionName === 'string' ? m.extensionName : 'extension'
      lines.push(`INJECTED [${extName}]: ${content}`)
    }
  }
  return lines.join('\n')
}

export interface CompressionResult {
  // Replacement view for the first `compressedFromCount` items of the
  // renderer's api-shape messages. The renderer substitutes them in before
  // sending the next chat call.
  compressedMessages: ApiShapeMessage[]
  // Number of original api-shape messages this view replaces. Used by the
  // renderer to slice out the substituted prefix.
  compressedFromCount: number
  // Raw renderer-message counterpart of compressedFromCount. Includes the
  // kept-verbatim recent-turn raw messages, since those are also embedded in
  // compressedMessages. Used by status reporting to count tool steps only in
  // the post-compression tail.
  compressedFromRawCount: number
  // How many older turns this snapshot folded into the summary. Surfaced in
  // the renderer's timeline divider so the user can see what got compressed.
  compressedTurnCount: number
}

// Discriminated outcome for a compression attempt. Every failure mode the
// renderer needs to surface to the user gets its own arm — keep this in sync
// with the renderer's compressNow() notify switch.
export type CompressionOutcome =
  | { status: 'compressed'; result: CompressionResult }
  | { status: 'too-short'; turnCount: number }
  | { status: 'no-model' }
  | { status: 'failed'; message: string }

export async function compressTurnsForContext(
  messages: RendererMessage[],
  modelConfig: ModelConfig,
  ollamaBaseUrl: string,
  // How many of the most recent turns to keep verbatim after the summary.
  // The auto-suggested compression keeps KEEP_RECENT_TURNS so recent context
  // stays sharp; a manual "compress everything" pass passes 0 to fold the
  // whole conversation into the summary.
  keepRecentTurns: number = KEEP_RECENT_TURNS
): Promise<CompressionOutcome> {
  const keep = Math.max(0, keepRecentTurns)
  const turns = splitIntoTurns(messages)
  // Nothing to fold: at keep=N we need more than N turns; at keep=0 we still
  // need at least one turn to summarize.
  if (turns.length <= keep || turns.length === 0) {
    return { status: 'too-short', turnCount: turns.length }
  }

  const oldTurns = turns.slice(0, turns.length - keep)
  const recentTurns = turns.slice(turns.length - keep)

  const oldDescriptions = oldTurns
    .map((t, idx) => `### Turn ${idx + 1}\n${describeTurnForSummary(messages, t)}`)
    .join('\n\n')

  let summary: string
  try {
    const model = await resolveModel(modelConfig, ollamaBaseUrl)
    const summaryPrompt = `You are compressing the older portion of a coding-assistant chat session to keep the model's context focused. For each turn below, write ONE short sentence (max 25 words) that captures: what the user asked, which tools the assistant used, and the outcome. Output as a numbered list with no preamble or trailing remarks.

${oldDescriptions}`
    const out = await generateText({
      model,
      messages: [{ role: 'user' as const, content: summaryPrompt }]
    })
    summary = out.text
  } catch (err) {
    return {
      status: 'failed',
      message: err instanceof Error ? err.message : String(err),
    }
  }

  const summaryBlock: ApiShapeMessage = {
    role: 'system',
    content: `Summary of earlier turns in this session (older history compressed to save context):\n${summary.trim()}`
  }

  // Append the recent turns verbatim, in api shape, after the summary.
  const recentApi: ApiShapeMessage[] = []
  for (const t of recentTurns) {
    for (let i = t.start; i <= t.end; i++) {
      const api = rendererToApi(messages[i])
      if (api) recentApi.push(api)
    }
  }

  // compressedMessages already contains the recent turns verbatim, so the
  // substitution covers ALL api-shape messages present at compression time.
  // The renderer slices its current apiMessages by this count and appends any
  // newer ones produced after compression. With keep=0 there are no recent
  // turns, so the boundary is the end of the last folded turn — i.e. the whole
  // conversation collapses to just the summary block.
  const boundaryTurn = recentTurns[recentTurns.length - 1] ?? oldTurns[oldTurns.length - 1]
  const compressedFromCount = boundaryTurn.apiEnd + 1
  const compressedFromRawCount = boundaryTurn.end + 1

  return {
    status: 'compressed',
    result: {
      compressedMessages: [summaryBlock, ...recentApi],
      compressedFromCount,
      compressedFromRawCount,
      compressedTurnCount: oldTurns.length,
    },
  }
}
