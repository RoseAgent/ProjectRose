import { streamText, stepCountIs } from 'ai'
import type { ModelMessage } from 'ai'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import type { ExtensionToolCtx } from '../../shared/extension-types'
import type { Message } from '../../shared/roseModelTypes'
import type { ModelConfig } from './settingsService'
import type { InjectionRecord } from '../../shared/extensionHooks'
import { fireThoughtHook, fireMessageHook, fireTokenHook } from './extensionHooks'
import { sessionRegistry } from './sessionRegistry'
import { toolRegistry } from './toolRegistry'
import type { EmitFn, HookCtx, ToolSourceName, SubagentTurnContext } from './toolRegistry'
import { resolveModel } from './modelResolution'

function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

// Screenshot tool result shape — declared on the session module so it sits
// next to the pending-screenshots Map that owns it; re-exported here for
// callers that historically imported it from llmClient.
export type { ScreenshotResult } from './chatSession'

export interface StreamResult {
  content: string
  inputTokens: number
  outputTokens: number
  // Full conversation including the assistant response(s) and any tool messages
  // produced during this streamChat call. Used by aiService.chat to extend the
  // history when an extension hook injects a follow-up message.
  finalMessages: ModelMessage[]
}

function isXmlParseError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('xml syntax error') || lower.includes('expected element type')
}

function toModelMessage(m: Message): ModelMessage {
  if (m.role === 'system') return { role: 'system', content: m.content }
  if (m.role === 'assistant') return { role: 'assistant', content: m.content }
  const atts = m.attachments ?? []
  if (atts.length === 0) return { role: 'user', content: m.content }
  return {
    role: 'user',
    content: [
      { type: 'text', text: m.content },
      ...atts.map((a) => ({ type: 'image' as const, image: a.dataUrl, mediaType: a.mimeType }))
    ]
  }
}

export async function streamChat(params: {
  messages: Message[]
  systemPrompt: string
  enabledExtensionIds?: string[]
  model: ModelConfig
  ollamaBaseUrl: string
  projectRoot: string
  disabledTools?: string[]
  abortSignal?: AbortSignal
  // Optional notify override — defaults to notifyRenderer (main agent).
  // Pass `() => {}` for subagents that should not emit IPC events.
  notify?: EmitFn
  // Which tool sources to ask the registry for. Defaults to all four.
  // `runAgentOnce` and subagents pass `['core', 'extension']` to keep
  // their tool sets bounded (no recursive subagent spawning).
  include?: readonly ToolSourceName[]
  // Per-turn context the subagent factory needs. Only required when
  // `include` contains `'subagent'` (i.e. the main user-visible chat).
  subagentContext?: SubagentTurnContext
  // Called fresh before each step — allows dynamic system prompt updates (e.g. loaded skills).
  getSystemPrompt?: () => string
  // When set, chat hooks fire at segment boundaries and after tool calls.
  // Only the user-visible main chat passes this; subagents and one-shot
  // background runs leave it undefined to keep hooks scoped to the main chat.
  turnId?: string
  // Host chat session id forwarded to extension tool execute() as toolCtx.sessionId.
  // Required so extensions can scope state (e.g. CLI session resume) per chat.
  sessionId: string
  collectInjections?: (rec: InjectionRecord) => void
  // Escape hatch for the auto-injection loop: when set, skip the Message[] →
  // ModelMessage[] conversion and use these directly. Lets the loop preserve
  // full assistant tool-call structure across iterations (Message[] is lossy).
  preBuiltCoreMessages?: ModelMessage[]
}): Promise<StreamResult> {
  const { messages, systemPrompt, enabledExtensionIds, model: modelConfig, ollamaBaseUrl, projectRoot, disabledTools, abortSignal } = params
  const emit: EmitFn = params.notify ?? notifyRenderer
  const hookCtx: HookCtx | undefined = params.turnId ? { turnId: params.turnId, rootPath: projectRoot } : undefined
  const toolCtx: ExtensionToolCtx = { sessionId: params.sessionId, turnId: params.turnId }
  const model = await resolveModel(modelConfig, ollamaBaseUrl)
  const tools = toolRegistry.getToolsForSession({
    rootPath: projectRoot,
    emit,
    toolCtx,
    hookCtx,
    disabledTools,
    enabledExtensionIds,
    include: params.include,
    subagent: params.subagentContext
  })

  let coreMessages: ModelMessage[] = params.preBuiltCoreMessages
    ? [...params.preBuiltCoreMessages]
    : messages.map((m) => toModelMessage(m))

  const fireBoundary = async (kind: 'thought' | 'message', content: string): Promise<void> => {
    if (!hookCtx || !params.collectInjections || content.length === 0) return
    // Injection budget lives on the ChatSession — look it up by sessionId.
    // No registered session means we're outside a turn (no current path
    // reaches this branch), in which case skip injecting.
    const session = sessionRegistry.get(params.sessionId)
    if (!session) return
    const rec = kind === 'thought'
      ? await fireThoughtHook(content, hookCtx.turnId, hookCtx.rootPath, session)
      : await fireMessageHook(content, hookCtx.turnId, hookCtx.rootPath, session)
    if (rec) params.collectInjections(rec)
  }

  let accumulatedText = ''
  let inputTokens = 0
  let outputTokens = 0
  // Some upstream models prefix the first message delta with stray newlines
  // (e.g. minimax). Swallow leading whitespace until the first real character.
  let textStarted = false

  for (let stepNum = 0; stepNum < 100; stepNum++) {
    let hadTools = false
    let finishReason: string | undefined

    // Inner retry loop — retries up to 2 times on XML parse errors from models like QWEN
    // that use XML-based tool calling and occasionally produce malformed output.
    for (let xmlRetries = 0; xmlRetries <= 2; xmlRetries++) {
      const result = streamText({
        model,
        system: params.getSystemPrompt?.() ?? systemPrompt,
        messages: coreMessages,
        tools,
        stopWhen: stepCountIs(1),
        abortSignal
      })

      let stepError: Error | null = null
      // Per-step segment buffers. A "segment" is a contiguous run of text-delta
      // or reasoning-delta chunks; the boundary is detected when the chunk type
      // changes. At each boundary we fire on_thought / on_message hooks with
      // the buffered content. Reset on every retry so a partial buffered
      // segment from a failed attempt does not leak into the retry.
      let textBuffer = ''
      let thinkingBuffer = ''

      try {
        for await (const chunk of result.fullStream) {
          // Boundary detection: flush buffers when transitioning to a different
          // chunk type. Tool-call chunks, finish chunks, etc. all close out
          // any in-flight text/thinking segments so hooks see contiguous content.
          if (chunk.type !== 'text-delta' && textBuffer.length > 0) {
            const flushed = textBuffer
            textBuffer = ''
            await fireBoundary('message', flushed)
          }
          if (chunk.type !== 'reasoning-delta' && thinkingBuffer.length > 0) {
            const flushed = thinkingBuffer
            thinkingBuffer = ''
            await fireBoundary('thought', flushed)
          }

          switch (chunk.type) {
            case 'text-delta':
              if (chunk.text) {
                let token = chunk.text
                if (!textStarted) {
                  token = token.replace(/^\s+/, '')
                  if (token.length === 0) break
                  textStarted = true
                }
                accumulatedText += token
                textBuffer += token
                emit(IPC.AI_TOKEN, { sessionId: params.sessionId, token })
                // Notify on_token hooks. Voided so a slow handler never stalls
                // streaming — handlers must self-throttle if they need to.
                if (hookCtx) void fireTokenHook(token, hookCtx.turnId, hookCtx.rootPath)
              }
              break
            case 'reasoning-delta':
              if (chunk.text) {
                thinkingBuffer += chunk.text
                emit(IPC.AI_THINKING, { sessionId: params.sessionId, content: chunk.text })
              }
              break
            case 'finish':
              if (chunk.totalUsage) {
                inputTokens += chunk.totalUsage.inputTokens ?? 0
                outputTokens += chunk.totalUsage.outputTokens ?? 0
              }
              break
            case 'error': {
              const e = chunk.error
              const errMsg = e instanceof Error ? e.message : (
                typeof e === 'object' && e !== null && 'message' in e
                  ? String((e as { message: unknown }).message)
                  : JSON.stringify(e)
              )
              if (e instanceof Error) throw e
              throw new Error(errMsg)
            }
          }
        }

        // End-of-stream flush in case the stream ended on a text/reasoning
        // delta without a separate boundary chunk.
        if (textBuffer.length > 0) {
          const flushed = textBuffer
          textBuffer = ''
          await fireBoundary('message', flushed)
        }
        if (thinkingBuffer.length > 0) {
          const flushed = thinkingBuffer
          thinkingBuffer = ''
          await fireBoundary('thought', flushed)
        }

        const steps = await result.steps
        const resp = await result.response
        const lastStep = steps.at(-1)
        hadTools = (lastStep?.toolCalls?.length ?? 0) > 0
        finishReason = lastStep?.finishReason
        coreMessages = [...coreMessages, ...resp.messages]
      } catch (err) {
        stepError = err instanceof Error ? err : new Error(String(err))
      }

      if (!stepError) break  // step succeeded — exit retry loop
      if (isXmlParseError(stepError.message) && xmlRetries < 2) continue
      throw stepError
    }

    if (!hadTools || finishReason === 'length' || finishReason === 'content-filter') break
  }

  return { content: accumulatedText, inputTokens, outputTokens, finalMessages: coreMessages }
}
