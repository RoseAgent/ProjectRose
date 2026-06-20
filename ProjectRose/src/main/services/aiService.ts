import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import type { ModelMessage } from 'ai'
import { compressTurnsForContext, streamChat } from './llmClient'
import type { ApiShapeMessage, CompressionResult, CompressionOutcome } from './llmClient'
import { getContextLength } from './contextLengthRegistry'
import { estimateTokens } from './tokenCounter'
import { readSettings } from './settingsService'
import type { AppSettings } from './settingsService'
import type { Message } from '../../shared/roseModelTypes'
import { ChatSession } from './chatSession'
import type { ChatResponse } from './chatSession'
import { sessionRegistry } from './sessionRegistry'
import { pickActiveModel } from './modelSelection'
import { toolRegistry } from './toolRegistry'
import { listInstalledExtensions } from './extensionService'
import type {
  DetachedRunTranscript,
  DetachedRunTranscriptEntry
} from '../../shared/detachedRunTranscript'

export type { ChatResponse }

function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

// ── Public API ──

/**
 * Run a user chat turn for the given session id. Constructs a
 * `ChatSession`, registers it so IPC handlers can route ask-user /
 * screenshot / cancel back to it, and delegates the actual work to
 * `session.run()`. The `finally` block both unregisters and disposes so
 * the registry never carries stale handles past a completed turn.
 */
export async function chat(messages: Message[], rootPath: string, sessionId: string): Promise<ChatResponse> {
  const session = new ChatSession({ sessionId, rootPath })
  sessionRegistry.register(session)
  try {
    return await session.run({ messages, notify: notifyRenderer })
  } finally {
    sessionRegistry.unregister(session.sessionId)
    session.dispose()
  }
}

/**
 * Run a single bounded background turn. Caller supplies a system prompt;
 * the role discriminator on `ChatSession` enforces the "no recursive
 * subagents, no skills, no user-message hook, no injection loop" rules
 * without the host having to know about them.
 */
export async function runAgentOnce(
  messages: Message[],
  rootPath: string,
  systemPrompt: string,
): Promise<ChatResponse> {
  // Background runs are not part of any user chat — give them their own
  // ephemeral session so extension tools (e.g. coding-agent harnesses)
  // treat each call as a fresh session.
  const session = new ChatSession({ sessionId: randomUUID(), rootPath, role: 'one-shot' })
  sessionRegistry.register(session)
  try {
    // No `notify` — one-shot runs are background work and should not
    // emit streaming events to the renderer's main chat timeline.
    return await session.run({ messages, systemPrompt })
  } finally {
    sessionRegistry.unregister(session.sessionId)
    session.dispose()
  }
}

// ── Detached Run with tools (ADR 0014) ──
//
// Sibling to `runAgentOnce`: runs a one-shot turn with an explicit tool
// allowlist and returns a structured transcript instead of a single string.
// Interactive tools (ask_user / screenshot) are stripped before the model
// sees the toolbox — routine fires happen with no user present, so any call
// to them would block forever or return an opaque '[cancelled]' the model
// can't interpret. See ADR 0014.

// Tools that need a user to be present. Always stripped from a routine's
// allowlist regardless of what the caller passed in. ask_user pushes a
// pending-resolver onto the session and waits for the renderer to reply;
// screenshot emits a capture request and waits for the renderer to send
// back a data URL. Neither has a meaningful headless behaviour.
const INTERACTIVE_TOOL_NAMES = new Set<string>(['ask_user', 'screenshot'])

export interface DetachedRunWarnings {
  /** Tool names the caller requested but the host did not find at fire time. */
  unknownTools: string[]
  /** Tool names the caller requested but the host auto-stripped (interactive). */
  strippedTools: string[]
}

export interface DetachedRunResult {
  transcript: DetachedRunTranscript
  warnings: DetachedRunWarnings
}

/**
 * Run a one-shot Agent turn with the supplied prompt and the explicit tool
 * allowlist. Returns the structured transcript plus warnings about tool
 * names that were stripped or unknown.
 *
 * Mirrors `runAgentOnce` in shape (single-iteration, no hooks, no subagent
 * recursion) but bypasses `ChatSession.run` because we need `finalMessages`
 * back to build the transcript.
 */
export async function runAgentOnceWithTools(
  prompt: string,
  systemPrompt: string,
  allowedTools: string[],
  rootPath: string
): Promise<DetachedRunResult> {
  const startedAt = Date.now()
  const sessionId = randomUUID()
  const settings = await readSettings(rootPath)
  const model = pickActiveModel(settings)
  if (!model) {
    throw new Error('No LLM model configured — open Settings → Providers to pick one.')
  }

  const installed = await listInstalledExtensions(rootPath)
  const enabledExtensionIds = installed.filter((e) => e.enabled).map((e) => e.manifest.id)

  // Compute the universe of tool names visible this run, then derive the
  // disabled list from "everything not in the allowlist, plus the always-
  // stripped interactive tools".
  const coreNames = new Set(toolRegistry.getCoreToolNames())
  const extensionNames = new Set(
    toolRegistry.getEnabledExtensionToolEntries(rootPath, enabledExtensionIds).map((e) => e.name)
  )
  const universe = new Set<string>([...coreNames, ...extensionNames])

  const allowed = new Set(allowedTools)
  const warnings: DetachedRunWarnings = {
    unknownTools: [],
    strippedTools: []
  }
  for (const name of allowed) {
    if (INTERACTIVE_TOOL_NAMES.has(name)) {
      warnings.strippedTools.push(name)
    } else if (!universe.has(name)) {
      warnings.unknownTools.push(name)
    }
  }

  const disabledTools: string[] = []
  for (const name of universe) {
    if (!allowed.has(name) || INTERACTIVE_TOOL_NAMES.has(name)) {
      disabledTools.push(name)
    }
  }

  // Register a one-shot session so any tool that reaches into the session
  // registry (recordModifiedFile, ask_user) finds a valid object — ask_user
  // and screenshot would normally hit pending-resolver tables on the session,
  // but we have already stripped them above.
  const session = new ChatSession({ sessionId, rootPath, role: 'one-shot' })
  sessionRegistry.register(session)

  try {
    const result = await streamChat({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt,
      enabledExtensionIds,
      model,
      ollamaBaseUrl: settings.ollamaBaseUrl,
      projectRoot: rootPath,
      disabledTools,
      include: ['core', 'extension'],
      notify: () => {},
      sessionId,
      abortSignal: session.abortSignal
    })

    const entries = buildTranscriptEntries(prompt, result.finalMessages)
    const transcript: DetachedRunTranscript = {
      entries,
      finalText: result.content,
      durationMs: Date.now() - startedAt,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      modelDisplay: model.modelName
    }
    return { transcript, warnings }
  } finally {
    sessionRegistry.unregister(session.sessionId)
    session.dispose()
  }
}

/**
 * Walk the Vercel AI SDK `ModelMessage[]` produced by `streamChat` and
 * emit a flat `DetachedRunTranscriptEntry[]` the renderer can render top-to-
 * bottom. We treat the initial user message (which was the prompt we
 * sent) as the first entry, then unfold each assistant/tool message into
 * one entry per content part.
 */
function buildTranscriptEntries(prompt: string, messages: ModelMessage[]): DetachedRunTranscriptEntry[] {
  const entries: DetachedRunTranscriptEntry[] = []
  entries.push({ kind: 'user_message', content: prompt })

  for (const msg of messages) {
    if (msg.role === 'user' || msg.role === 'system') continue // already captured / not useful for audit
    if (msg.role === 'assistant') {
      const parts = normaliseContentParts(msg.content)
      for (const part of parts) {
        const partRecord = part as Record<string, unknown>
        const type = partRecord.type as string | undefined
        if (type === 'text') {
          const text = typeof partRecord.text === 'string' ? partRecord.text : ''
          if (text.length > 0) entries.push({ kind: 'assistant_message', content: text })
        } else if (type === 'reasoning') {
          const text = typeof partRecord.text === 'string' ? partRecord.text : ''
          if (text.length > 0) entries.push({ kind: 'assistant_thought', content: text })
        } else if (type === 'tool-call') {
          const toolName = typeof partRecord.toolName === 'string' ? partRecord.toolName : 'unknown'
          const toolCallId = typeof partRecord.toolCallId === 'string' ? partRecord.toolCallId : ''
          const input = (partRecord.input ?? partRecord.args) as unknown
          entries.push({ kind: 'tool_call', toolName, toolCallId, input })
        }
      }
      continue
    }
    if (msg.role === 'tool') {
      const parts = normaliseContentParts(msg.content)
      for (const part of parts) {
        const partRecord = part as Record<string, unknown>
        if (partRecord.type === 'tool-result') {
          const toolName = typeof partRecord.toolName === 'string' ? partRecord.toolName : 'unknown'
          const toolCallId = typeof partRecord.toolCallId === 'string' ? partRecord.toolCallId : ''
          const output = stringifyToolOutput(partRecord.output ?? partRecord.result)
          entries.push({ kind: 'tool_result', toolName, toolCallId, output })
        }
      }
      continue
    }
  }
  return entries
}

function normaliseContentParts(content: unknown): unknown[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (Array.isArray(content)) return content
  return []
}

function stringifyToolOutput(output: unknown): string {
  if (output == null) return ''
  if (typeof output === 'string') return output
  // The Vercel AI SDK wraps tool results in a `{ type: 'json' | 'text' | ..., value }` shape.
  const r = output as Record<string, unknown>
  if (typeof r.value === 'string') return r.value
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

// ── Context compression / status ──

export interface ContextStatus {
  estimatedTokens: number
  contextLength: number
  percentUsed: number
  totalToolSteps: number
}

// Count renderer 'tool' messages — used as the second arm of the threshold
// (independent of token estimate so cloud models with huge context windows
// still surface a suggestion when tool usage piles up).
function countToolSteps(messages: Array<Record<string, unknown>>): number {
  let n = 0
  for (const m of messages) if (m.role === 'tool') n++
  return n
}

// Convert renderer messages to api shape (user/assistant/system) for token
// estimation. Mirrors renderer's buildApiMessages so the count reflects
// what the model actually sees.
function toApiShape(messages: Array<Record<string, unknown>>): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = []
  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content : ''
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content })
    } else if (m.role === 'injected') {
      const extName = typeof m.extensionName === 'string' ? m.extensionName : 'extension'
      out.push({ role: 'system', content: `[Extension ${extName}] ${content}` })
    }
  }
  return out
}

export interface ContextStatusCompression {
  compressedMessages: ApiShapeMessage[]
  compressedFromCount: number
  compressedFromRawCount: number
}

export async function getContextStatus(
  rootPath: string,
  messages: Array<Record<string, unknown>>,
  compression: ContextStatusCompression | null
): Promise<ContextStatus> {
  const settings: AppSettings = await readSettings(rootPath)
  const model = pickActiveModel(settings)
  const contextLength = model
    ? await getContextLength(model.provider, model.modelName, settings.ollamaBaseUrl)
    : 8192

  // Mirror renderer's substituteCompressionSnapshot: when a compression
  // snapshot is present and the prefix it claims to replace is still intact,
  // count tokens/tool-steps against the post-compression view (what the LLM
  // actually sees). Otherwise fall back to raw — same fail-open the renderer
  // uses on prefix-mismatch.
  let apiShape: Array<{ role: string; content: string }>
  let toolSteps: number
  if (compression && messages.length >= compression.compressedFromRawCount) {
    const tail = messages.slice(compression.compressedFromRawCount)
    apiShape = [
      ...compression.compressedMessages.map((m) => ({ role: m.role, content: m.content })),
      ...toApiShape(tail),
    ]
    toolSteps = countToolSteps(tail)
  } else {
    apiShape = toApiShape(messages)
    toolSteps = countToolSteps(messages)
  }

  const estimatedTokens = estimateTokens(apiShape)
  const percentUsed = contextLength > 0 ? estimatedTokens / contextLength : 0
  return {
    estimatedTokens,
    contextLength,
    percentUsed,
    totalToolSteps: toolSteps,
  }
}

export async function compressToolNoise(
  rootPath: string,
  messages: Array<Record<string, unknown>>,
  // When true, fold the entire conversation into the summary (keep 0 recent
  // turns verbatim). The default keeps the recent turns, matching the
  // auto-suggested compression.
  full = false
): Promise<CompressionOutcome> {
  const settings = await readSettings(rootPath)
  const model = pickActiveModel(settings)
  if (!model) return { status: 'no-model' }
  return compressTurnsForContext(
    messages,
    model,
    settings.ollamaBaseUrl,
    full ? 0 : undefined
  )
}

export type { CompressionResult, ApiShapeMessage, CompressionOutcome }
