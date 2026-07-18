import { describe, it, expect, vi, beforeEach } from 'vitest'

// All of these modules are pulled in by ChatSession.run() at load time and
// would otherwise reach into the filesystem / Electron IPC. The stubs return
// the minimum shape run() needs to walk the loop without crashing.
vi.mock('../settingsService', () => ({
  readSettings: vi.fn(async () => ({
    userName: 'tester',
    agentName: 'rose',
    ollamaBaseUrl: '',
    // The composer's last-used pick — run() falls back to this when the
    // caller passes no explicit model.
    lastModel: { provider: 'ollama', modelName: 'fake' },
  })),
}))
vi.mock('../projectSettingsService', () => ({
  readProjectSettings: vi.fn(async () => ({ disabledTools: [], disabledPrompts: [] })),
}))
vi.mock('../extensionService', () => ({
  listInstalledExtensions: vi.fn(async () => []),
}))
vi.mock('../extensionHooks', () => ({
  fireUserMessageHook: vi.fn(async () => {}),
}))
vi.mock('../skillService', () => ({
  getSessionSkillsPrompt: vi.fn(() => ''),
}))
vi.mock('../agentMd', () => ({
  buildAgentMd: vi.fn(async () => 'system-prompt'),
}))
vi.mock('../modelSelection', async () => {
  const actual = await vi.importActual<typeof import('../modelSelection')>(
    '../modelSelection'
  )
  return {
    ...actual,
    validateModelCredentials: vi.fn(async () => {}),
  }
})

import { ChatSession, type RunOnceFn } from '../chatSession'
import type { StreamResult } from '../llmClient'
import type { Message } from '../../../shared/roseModelTypes'
import type { ModelMessage } from 'ai'
import { fireUserMessageHook } from '../extensionHooks'

describe('ChatSession.run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the fake LLM content as the ChatResponse content', async () => {
    const finalMessages: ModelMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello back' },
    ]
    const fakeStream: StreamResult = {
      content: 'hello back',
      inputTokens: 1,
      outputTokens: 2,
      finalMessages,
    }
    const runOnce: RunOnceFn = vi.fn(async () => fakeStream)

    const session = new ChatSession({ sessionId: 's1', rootPath: '/proj' })
    const messages: Message[] = [{ role: 'user', content: 'hi' }]
    const response = await session.run({ messages, runOnce })

    expect(response.content).toBe('hello back')
    expect(response.modifiedFiles).toEqual([])
    expect(response.modelDisplay).toBe('fake')
    expect(runOnce).toHaveBeenCalledTimes(1)
  })

  it('prefers an explicit per-conversation model over the lastModel fallback', async () => {
    const runOnce: RunOnceFn = vi.fn(async () => ({
      content: 'ok',
      inputTokens: 0,
      outputTokens: 0,
      finalMessages: [],
    }))
    const session = new ChatSession({ sessionId: 's1', rootPath: '/proj' })
    const response = await session.run({
      messages: [{ role: 'user', content: 'hi' }],
      model: { provider: 'kimi', modelName: 'kimi-k2-thinking' },
      runOnce,
    })
    expect(response.modelDisplay).toBe('kimi-k2-thinking')
  })

  it('throws when no model is passed and no lastModel is stored', async () => {
    const { readSettings } = await import('../settingsService')
    vi.mocked(readSettings).mockResolvedValueOnce({
      userName: 'tester',
      agentName: 'rose',
      ollamaBaseUrl: '',
    } as never)
    const runOnce: RunOnceFn = vi.fn(async () => ({
      content: '',
      inputTokens: 0,
      outputTokens: 0,
      finalMessages: [],
    }))
    const session = new ChatSession({ sessionId: 's1', rootPath: '/proj' })
    await expect(
      session.run({ messages: [{ role: 'user', content: 'hi' }], runOnce })
    ).rejects.toThrow(/No model selected/)
    expect(runOnce).not.toHaveBeenCalled()
  })

  it('iterates the injection loop until no extension injection is produced', async () => {
    const baseFinal: ModelMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'first' },
    ]
    // First call collects an injection; second call settles with none.
    const calls: Array<number> = []
    const runOnce: RunOnceFn = vi.fn(async (args) => {
      calls.push(args.preBuiltCoreMessages?.length ?? 0)
      if (calls.length === 1) {
        args.collectInjections({
          extensionId: 'ext.test',
          extensionName: 'Test Ext',
          content: 'wake up',
          // The InjectionRecord shape carries an optional icon — omit it.
        } as Parameters<typeof args.collectInjections>[0])
      }
      return {
        content: calls.length === 2 ? 'second-final' : 'first',
        inputTokens: 0,
        outputTokens: 0,
        finalMessages: baseFinal,
      }
    })

    const session = new ChatSession({ sessionId: 's1', rootPath: '/proj' })
    const response = await session.run({
      messages: [{ role: 'user', content: 'hi' }],
      runOnce,
    })

    expect(runOnce).toHaveBeenCalledTimes(2)
    // Iteration 1: no preBuilt yet (undefined → 0). Iteration 2: preBuilt is
    // baseFinal + one injection system msg (2 + 1 = 3).
    expect(calls).toEqual([0, 3])
    // The settled response reflects the LAST stream (no further injections).
    expect(response.content).toBe('second-final')
  })

  it('records files written during the turn on session.modifiedFiles', async () => {
    const runOnce: RunOnceFn = vi.fn(async () => {
      // Simulate a tool handler having pushed into the session's list.
      session.modifiedFiles.push('/proj/a.ts', '/proj/b.ts')
      return {
        content: 'wrote two',
        inputTokens: 0,
        outputTokens: 0,
        finalMessages: [],
      }
    })

    const session = new ChatSession({ sessionId: 's1', rootPath: '/proj' })
    const response = await session.run({
      messages: [{ role: 'user', content: 'write some files' }],
      runOnce,
    })

    expect(response.modifiedFiles).toEqual(['/proj/a.ts', '/proj/b.ts'])
  })

  it('emits AI_MODEL_SELECTED with the session id on the notify channel', async () => {
    const notify = vi.fn()
    const runOnce: RunOnceFn = vi.fn(async () => ({
      content: '',
      inputTokens: 0,
      outputTokens: 0,
      finalMessages: [],
    }))

    const session = new ChatSession({ sessionId: 'sess-x', rootPath: '/proj' })
    await session.run({
      messages: [{ role: 'user', content: 'hi' }],
      runOnce,
      notify,
    })

    const modelSelectedCall = notify.mock.calls.find(
      ([channel]) => channel === 'ai:modelSelected'
    )
    expect(modelSelectedCall).toBeDefined()
    expect(modelSelectedCall?.[1]).toMatchObject({ sessionId: 'sess-x' })
  })
})

describe('ChatSession.run — main vs subagent parity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Reusable fake LLM that records what it was called with on each call.
  // No injection is fired so the main loop terminates after one iteration.
  function makeRecorder() {
    const recorded: Array<{
      baseInclude: unknown
      subagentContext: unknown
    }> = []
    const runOnce: RunOnceFn = vi.fn(async (args) => {
      recorded.push({
        baseInclude: (args.baseStreamParams as { include?: unknown }).include,
        subagentContext: args.subagentContext,
      })
      return {
        content: 'reply',
        inputTokens: 0,
        outputTokens: 0,
        finalMessages: [],
      }
    })
    return { runOnce, recorded }
  }

  it('main fires the user-message hook; subagent does not', async () => {
    const { runOnce: runOnceMain } = makeRecorder()
    const { runOnce: runOnceSub } = makeRecorder()
    const fireUserMessageHookMock = vi.mocked(fireUserMessageHook)

    const main = new ChatSession({ sessionId: 'm', rootPath: '/proj', role: 'main' })
    await main.run({
      messages: [{ role: 'user', content: 'hi' }],
      runOnce: runOnceMain,
    })
    expect(fireUserMessageHookMock).toHaveBeenCalledTimes(1)

    fireUserMessageHookMock.mockClear()

    const sub = new ChatSession({ sessionId: 's', rootPath: '/proj', role: 'subagent' })
    await sub.run({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'sub system',
      runOnce: runOnceSub,
    })
    expect(fireUserMessageHookMock).not.toHaveBeenCalled()
  })

  it('main passes include=undefined (full tool set) and a subagent context; subagent passes include=[core,extension] and no subagent context', async () => {
    const { runOnce: runOnceMain, recorded: mainCalls } = makeRecorder()
    const { runOnce: runOnceSub, recorded: subCalls } = makeRecorder()

    const main = new ChatSession({ sessionId: 'm', rootPath: '/proj', role: 'main' })
    await main.run({
      messages: [{ role: 'user', content: 'hi' }],
      runOnce: runOnceMain,
    })

    const sub = new ChatSession({ sessionId: 's', rootPath: '/proj', role: 'subagent' })
    await sub.run({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'sub system',
      runOnce: runOnceSub,
    })

    // Main: every iteration gets the full tool set (include undefined) and
    // a subagent context so create_subagents / explore can be invoked.
    expect(mainCalls[0].baseInclude).toBeUndefined()
    expect(mainCalls[0].subagentContext).toBeDefined()

    // Subagent: include narrows the tool set; no subagent context means
    // create_subagents/explore are absent — no recursive spawning.
    expect(subCalls[0].baseInclude).toEqual(['core', 'extension'])
    expect(subCalls[0].subagentContext).toBeUndefined()
  })

  it('main iterates when injections are collected; subagent runs runOnce exactly once even when collectInjections is called', async () => {
    // Custom recorder that ACTUALLY mutates a counter so we can drive a
    // multi-iteration scenario for main without relying on internal state.
    let mainCalls = 0
    const runOnceMain: RunOnceFn = vi.fn(async (args) => {
      mainCalls++
      if (mainCalls === 1) {
        args.collectInjections({
          extensionId: 'ext.test',
          extensionName: 'Test Ext',
          content: 'continue',
        } as Parameters<typeof args.collectInjections>[0])
      }
      return {
        content: 'main-reply',
        inputTokens: 0,
        outputTokens: 0,
        finalMessages: [],
      }
    })

    let subCalls = 0
    const runOnceSub: RunOnceFn = vi.fn(async (args) => {
      subCalls++
      // Even if a hook somehow tried to inject, the subagent role drops it.
      args.collectInjections({
        extensionId: 'ext.test',
        extensionName: 'Test Ext',
        content: 'continue',
      } as Parameters<typeof args.collectInjections>[0])
      return {
        content: 'sub-reply',
        inputTokens: 0,
        outputTokens: 0,
        finalMessages: [],
      }
    })

    const main = new ChatSession({ sessionId: 'm', rootPath: '/proj', role: 'main' })
    await main.run({
      messages: [{ role: 'user', content: 'hi' }],
      runOnce: runOnceMain,
    })
    // Two iterations: first collects, second sees an empty collection.
    expect(mainCalls).toBe(2)

    const sub = new ChatSession({ sessionId: 's', rootPath: '/proj', role: 'subagent' })
    await sub.run({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'sub system',
      runOnce: runOnceSub,
    })
    expect(subCalls).toBe(1)
  })

  it('main emits AI_MODEL_SELECTED on the renderer notify; subagent does not', async () => {
    const mainNotify = vi.fn()
    const subNotify = vi.fn()
    const { runOnce: runOnceMain } = makeRecorder()
    const { runOnce: runOnceSub } = makeRecorder()

    const main = new ChatSession({ sessionId: 'm', rootPath: '/proj', role: 'main' })
    await main.run({
      messages: [{ role: 'user', content: 'hi' }],
      runOnce: runOnceMain,
      notify: mainNotify,
    })

    const sub = new ChatSession({ sessionId: 's', rootPath: '/proj', role: 'subagent' })
    await sub.run({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'sub system',
      runOnce: runOnceSub,
      notify: subNotify,
    })

    const mainModelSelected = mainNotify.mock.calls.find(
      ([channel]) => channel === 'ai:modelSelected'
    )
    expect(mainModelSelected).toBeDefined()

    const subModelSelected = subNotify.mock.calls.find(
      ([channel]) => channel === 'ai:modelSelected'
    )
    expect(subModelSelected).toBeUndefined()
  })

  it('subagent and main keep independent pendingAskUser maps so a user answer cannot resolve the other session\'s question', async () => {
    const main = new ChatSession({ sessionId: 'm', rootPath: '/proj', role: 'main' })
    const sub = new ChatSession({ sessionId: 's', rootPath: '/proj', role: 'subagent' })

    const mainAnswer = new Promise<string>((resolve) =>
      main.pendingAskUser.set('q1', resolve)
    )
    const subAnswer = new Promise<string>((resolve) =>
      sub.pendingAskUser.set('q1', resolve)
    )

    // Answer routes via sessionRegistry.get(sessionId).resolveAskUserQuestion
    // — call the subagent's resolver directly to model the IPC path.
    sub.resolveAskUserQuestion('q1', 'from-sub')
    await expect(subAnswer).resolves.toBe('from-sub')

    // The main session's pending question is untouched.
    expect(main.pendingAskUser.has('q1')).toBe(true)
    main.resolveAskUserQuestion('q1', 'from-main')
    await expect(mainAnswer).resolves.toBe('from-main')
  })
})
