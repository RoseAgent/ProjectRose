import { randomUUID } from 'crypto'
import type { ModelMessage } from 'ai'
import { IPC } from '../../shared/ipcChannels'
import type { Message } from '../../shared/roseModelTypes'
import type { InjectionRecord } from '../../shared/extensionHooks'
import { readSettings } from './settingsService'
import type { ModelConfig } from './settingsService'
import { readProjectSettings } from './projectSettingsService'
import { listInstalledExtensions } from './extensionService'
import { fireUserMessageHook } from './extensionHooks'
import { getSessionSkillsPrompt } from './skillService'
import { streamChat } from './llmClient'
import type { StreamResult } from './llmClient'
import type { AgentContext, SubagentCounter } from './agentRunner'
import type { SubagentTurnContext, ToolSourceName } from './toolRegistry'
import { buildAgentMd } from './agentMd'
import { pickActiveModel, validateModelCredentials } from './modelSelection'
import { logAssistantMessage, logUserMessage } from './memory/conversationLog'
import { logInteraction } from './interactionLog'

// Screenshot result shape — duplicated from llmClient.ts so chatSession.ts
// does not import from llmClient (which would form a cycle).
export type ScreenshotResult =
  | { ok: true; dataUrl: string; mode: 'screen' | 'webcam'; sourceLabel: string | null }
  | { ok: false; reason: string }

/**
 * Final response surfaced to the IPC caller after `ChatSession.run()` settles.
 * Mirrors the shape the renderer expects on the `AI_CHAT` invoke return.
 */
export interface ChatResponse {
  content: string
  modifiedFiles: string[]
  modelDisplay: string
}

/**
 * Discriminator for what kind of turn this session runs.
 *
 * - `'main'` is the user-visible chat. It fires `on_user_message` hooks,
 *   collects extension injections between iterations, can spawn subagents
 *   and skills, and exposes streaming events to the renderer.
 * - `'subagent'` is a recursive agent spawned by `create_subagents` /
 *   `explore`. Single iteration, no hook fire, no further subagent or
 *   skill tools (so the loop terminates), no streaming to the renderer.
 * - `'one-shot'` is a background invocation (extension `runAgentOnce`)
 *   that behaves like a subagent but additionally lets the caller
 *   supply a custom system prompt without going through `buildAgentMd`.
 */
export type ChatRole = 'main' | 'subagent' | 'one-shot'

/**
 * Notify function injected by the caller. Production wires this to a
 * `BrowserWindow.getAllWindows().forEach(send)` from `aiService.ts`; tests
 * pass a stub (or omit it, in which case streaming events are dropped).
 *
 * Lives as an injected dependency rather than a top-level
 * `import { BrowserWindow } from 'electron'` so the test runner can load
 * `chatSession.ts` without pulling in the Electron binary.
 */
export type NotifyFn = (channel: string, payload: unknown) => void
const noopNotify: NotifyFn = () => {}

/**
 * A `ChatSession` owns all state whose lifetime equals a single chat turn:
 * the abort controller, the pending ask-user table, the pending screenshot
 * table, the per-turn `modifiedFiles` list, and the per-extension
 * injection budget. Construct one at the start of a turn, dispose it in
 * `finally`. A fresh session implies all state is fresh — no cross-module
 * "reset" calls are required.
 *
 * The session also owns the chat loop itself via `run()`. Public callers
 * construct a session, register it, call `.run(messages)`, then dispose —
 * the loop body, model fallback, injection collection, and notify wiring
 * live entirely inside this class.
 */
export class ChatSession {
  readonly sessionId: string
  readonly rootPath: string
  readonly role: ChatRole
  readonly abortController: AbortController

  // Pending ask_user resolvers — keyed by toolCallId. The `ask_user` tool
  // pushes a resolver here when it emits the question to the renderer; the
  // renderer's reply is routed back here via the IPC handler.
  readonly pendingAskUser = new Map<string, (answer: string) => void>()

  // Pending screenshot resolvers — keyed by toolCallId. The `screenshot`
  // tool pushes a resolver here when it emits the capture request to the
  // renderer; the renderer's result is routed back here via the IPC handler.
  readonly pendingScreenshots = new Map<string, (result: ScreenshotResult) => void>()

  // Absolute paths of files written or edited during this turn. The
  // file-write tools (`write_file`, `edit_file`) push here; the chat loop
  // reads the array at end of turn so the renderer can update its
  // "modified files" UI. Per-turn lifetime — the array is empty at
  // construction time and is dropped with the session.
  readonly modifiedFiles: string[] = []

  // Per-extension injection budget for the current user turn. Key =
  // extensionId, value = number of injections used so far. Fresh per
  // session, so a new user turn starts with an empty budget without any
  // cross-module "reset" call. Read and incremented by `fireInjectingHooks`
  // in `extensionHooks.ts`.
  readonly turnBudget = new Map<string, number>()

  constructor(args: { sessionId: string; rootPath: string; role?: ChatRole }) {
    this.sessionId = args.sessionId
    this.rootPath = args.rootPath
    this.role = args.role ?? 'main'
    this.abortController = new AbortController()
  }

  get abortSignal(): AbortSignal {
    return this.abortController.signal
  }

  /**
   * Look up a pending ask-user resolver and fulfil it. No-op if the id is
   * not pending (the question was already answered or cancelled).
   */
  resolveAskUserQuestion(toolCallId: string, answer: string): void {
    const resolve = this.pendingAskUser.get(toolCallId)
    if (!resolve) return
    this.pendingAskUser.delete(toolCallId)
    resolve(answer)
  }

  /**
   * Resolve every pending ask-user with `'[cancelled]'`. Called when the
   * user cancels the chat — the renderer no longer expects an answer, so
   * unblocking the tool with a sentinel value lets the turn unwind cleanly.
   */
  cancelPendingAskUser(): void {
    for (const resolve of this.pendingAskUser.values()) resolve('[cancelled]')
    this.pendingAskUser.clear()
  }

  /**
   * Look up a pending screenshot resolver and fulfil it. No-op if the id is
   * not pending (the request was already resolved or cancelled).
   */
  resolveScreenshot(toolCallId: string, result: ScreenshotResult): void {
    const resolve = this.pendingScreenshots.get(toolCallId)
    if (!resolve) return
    this.pendingScreenshots.delete(toolCallId)
    resolve(result)
  }

  /**
   * Cancel every pending screenshot capture with
   * `{ ok: false, reason: 'cancelled' }` so the tool execute body unblocks
   * and the turn unwinds. This closes a leak in the prior code where
   * cancelling a chat aborted the controller but left screenshot resolvers
   * dangling forever (the module-level `cancelAllScreenshotRequests` was
   * never wired in).
   */
  cancelPendingScreenshots(): void {
    for (const resolve of this.pendingScreenshots.values()) {
      resolve({ ok: false, reason: 'cancelled' })
    }
    this.pendingScreenshots.clear()
  }

  /**
   * Cancel the turn: abort the controller and reject any pending
   * cross-process resolvers owned by this session.
   */
  cancel(): void {
    this.abortController.abort()
    this.cancelPendingAskUser()
    this.cancelPendingScreenshots()
  }

  /**
   * Release everything the session held. Called from the `finally` of the
   * turn that constructed it. The registry unregister is the caller's
   * responsibility — `aiService` wires both calls in the same block.
   */
  dispose(): void {
    this.cancelPendingAskUser()
    this.cancelPendingScreenshots()
  }

  /**
   * Run a single user turn end-to-end on this session.
   *
   * The body owns: extension `on_user_message` firing, model selection,
   * system prompt construction, subagent/skill tool context build-out, the
   * extension injection loop, and the streaming wire-up via `streamChat`.
   * Notifications (`AI_MODEL_SELECTED`, `AI_INJECTED_MESSAGE`) are emitted
   * directly to the renderer with the session id attached so the renderer
   * can drop late events from abandoned sessions.
   *
   * `runOnce` is exposed as a parameter so tests can substitute a fake
   * LLM without spinning up the full streaming path. In production the
   * default points at `streamChat` and behaves identically to the prior
   * `chat()` body.
   */
  async run(args: {
    messages: Message[]
    /**
     * System prompt override. Required for `'subagent'` and `'one-shot'`
     * sessions, which supply their own; the main chat omits this and the
     * session calls `buildAgentMd(rootPath)` to compose the prompt from
     * ROSE.md, environment data, and per-extension prompt overrides.
     */
    systemPrompt?: string
    /**
     * The Conversation's provider+model pair, chosen in the chat composer.
     * Omitted by background callers (subagent parents pass their own model
     * downstream; one-shot runs have no Conversation) — those fall back to
     * settings.lastModel, the user's most recent composer pick.
     */
    model?: ModelConfig
    notify?: NotifyFn
    runOnce?: RunOnceFn
  }): Promise<ChatResponse> {
    const { messages } = args
    const notify: NotifyFn = args.notify ?? noopNotify
    const runOnceImpl = args.runOnce ?? defaultRunOnce
    const { sessionId, rootPath, role } = this
    const isMain = role === 'main'
    const abortController = this.abortController

    const settings = await readSettings(rootPath)
    const userMessage = messages.at(-1)?.content ?? ''
    // Fire once per user-initiated turn so extensions can reset per-turn
    // state. Subagents and one-shot runs intentionally skip the hook: they
    // are spawned by an existing turn (subagents) or are not user-visible
    // (one-shot), and re-firing would cause extensions to wipe state mid-turn.
    if (isMain) await fireUserMessageHook(userMessage, rootPath)
    // Memory: persist the user message to ~/.rose/memory/conversations/<today>.jsonl.
    // Only main turns are logged — subagent/one-shot are background work that
    // would clutter the diary's view of the user's day.
    if (isMain && userMessage) {
      void logUserMessage({ sessionId, rootPath, content: userMessage })
      logInteraction('chat.message-sent')
    }
    const selectedModel = args.model ?? pickActiveModel(settings)
    if (!selectedModel) {
      throw new Error(
        'No model selected — pick one in the chat composer, or configure a provider in Settings.'
      )
    }
    await validateModelCredentials(selectedModel, settings)
    const modelDisplay = selectedModel.modelName
    // Only main chat notifies the renderer about model selection. Subagent
    // and one-shot sessions are background work — their model events should
    // not show up in the user's main timeline.
    if (isMain) notify(IPC.AI_MODEL_SELECTED, { sessionId, modelDisplay })

    const systemPrompt = args.systemPrompt ?? (await buildAgentMd(rootPath))

    const projectSettings = await readProjectSettings(rootPath)
    const { disabledTools } = projectSettings

    const installed = await listInstalledExtensions(rootPath)
    const enabledExtensionIds = installed.filter((e) => e.enabled).map((e) => e.manifest.id)

    // Per-session subagent context. Re-built for each `streamChat` call so
    // a fallback model rebuild picks up the new model without any closure
    // staleness (the prior `buildExtraTools(model)` helper did the same).
    // Only main chat carries this context — subagent/one-shot intentionally
    // omit it to keep the tool set bounded and prevent recursive spawning.
    const agentCtx: AgentContext = {
      sessionId,
      agentIndex: 0,
      rootPath,
      notify,
      abortSignal: abortController.signal,
    }
    const counter: SubagentCounter = { value: 0 }
    const getSystemPrompt = (): string =>
      isMain ? systemPrompt + getSessionSkillsPrompt(sessionId) : systemPrompt

    const buildSubagentContext = (m: ModelConfig): SubagentTurnContext | undefined =>
      isMain
        ? {
            agentCtx,
            model: m,
            ollamaBaseUrl: settings.ollamaBaseUrl,
            counter,
            systemPrompt,
          }
        : undefined

    // Tool source filter. Main chat gets the full set (core, extension,
    // subagent, skill); subagent and one-shot are deliberately bounded to
    // core + extension so the loop terminates and the model can't recurse.
    const include: readonly ToolSourceName[] | undefined = isMain
      ? undefined
      : (['core', 'extension'] as const)

    const baseStreamParams = {
      systemPrompt,
      getSystemPrompt,
      enabledExtensionIds,
      ollamaBaseUrl: settings.ollamaBaseUrl,
      projectRoot: rootPath,
      disabledTools,
      abortSignal: abortController.signal,
      notify,
      include,
    }

    const activeModel = selectedModel
    let lastStreamResult: StreamResult | undefined
    let preBuiltCoreMessages: ModelMessage[] | undefined

    while (true) {
      if (abortController.signal.aborted) break

      const turnId = randomUUID()
      const collected: InjectionRecord[] = []

      const runOnce = (m: ModelConfig): Promise<StreamResult> =>
        runOnceImpl({
          baseStreamParams,
          messages,
          preBuiltCoreMessages,
          model: m,
          subagentContext: buildSubagentContext(m),
          // turnId/collectInjections only make sense when the injection
          // loop is active. Non-main roles emit a constant turnId so
          // hook-id strings still parse but never collect.
          turnId,
          sessionId,
          collectInjections: (rec) => {
            if (isMain) collected.push(rec)
          },
        })

      lastStreamResult = await runOnce(activeModel)

      // Subagent / one-shot: a single iteration. Even if an extension hook
      // somehow snuck an injection in, the role bound on collectInjections
      // dropped it.
      if (!isMain) break
      if (collected.length === 0) break
      if (abortController.signal.aborted) break

      // Each injection becomes a system message in the next iteration's
      // history; the renderer is also notified so it can display the
      // bordered "guided agent" cell for the user.
      const nextHistory: ModelMessage[] = [...lastStreamResult.finalMessages]
      for (const inj of collected) {
        notify(IPC.AI_INJECTED_MESSAGE, {
          sessionId,
          extensionId: inj.extensionId,
          extensionName: inj.extensionName,
          extensionIcon: inj.extensionIcon,
          content: inj.content,
        })
        nextHistory.push({
          role: 'system',
          content: `[Extension ${inj.extensionName}] ${inj.content}`,
        })
      }
      preBuiltCoreMessages = nextHistory
    }

    if (!lastStreamResult) throw new Error('Chat aborted before any turn completed')
    // Snapshot before dispose — the session is about to be cleared.
    const modifiedFiles = [...this.modifiedFiles]
    // Memory: persist the final assistant message alongside the user turn so
    // the diary writer can reconstruct the day's exchanges. Same gating as
    // the user log above — main turns only.
    if (isMain && lastStreamResult.content) {
      void logAssistantMessage({ sessionId, rootPath, content: lastStreamResult.content })
    }
    return {
      content: lastStreamResult.content,
      modifiedFiles,
      modelDisplay,
    }
  }
}

/**
 * Shape of a single streaming round trip. Tests substitute a fake LLM here;
 * the production path defaults to `streamChat` and behaves like the prior
 * code. `baseStreamParams` is opaque to the test seam — it is forwarded
 * verbatim into `streamChat` so the production path stays identical.
 */
export interface RunOnceArgs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseStreamParams: any
  messages: Message[]
  preBuiltCoreMessages: ModelMessage[] | undefined
  model: ModelConfig
  // Subagent context is `undefined` for `'subagent'` and `'one-shot'`
  // sessions — they don't build the recursive spawning tools and so the
  // dispatcher in `streamChat` does not need a turn context for the
  // subagent source.
  subagentContext: SubagentTurnContext | undefined
  turnId: string
  sessionId: string
  collectInjections: (rec: InjectionRecord) => void
}
export type RunOnceFn = (args: RunOnceArgs) => Promise<StreamResult>

const defaultRunOnce: RunOnceFn = ({
  baseStreamParams,
  messages,
  preBuiltCoreMessages,
  model,
  subagentContext,
  turnId,
  sessionId,
  collectInjections,
}) =>
  streamChat({
    ...baseStreamParams,
    messages,
    preBuiltCoreMessages,
    model,
    subagentContext,
    turnId,
    sessionId,
    collectInjections,
  })
