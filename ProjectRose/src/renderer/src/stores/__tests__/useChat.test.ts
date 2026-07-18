import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The chat input flow captures a frame from the screen-webcam hook before
// posting the user message. That hook reaches into HTMLVideoElement /
// MediaStream which don't exist in the test environment, so stub it.
import type { MessageAttachment } from '@shared/roseModelTypes'
const captureFrame = vi.fn<() => Promise<MessageAttachment | null>>(async () => null)
vi.mock('../../hooks/useScreenWebcamShare', () => ({
  useScreenWebcamShare: {
    getState: () => ({ captureFrame }),
  },
}))

import { useChat, detectEmptyResponseError } from '../useChat'
import type { UserMessage } from '../../types/chatMessages'
import { useProjectStore } from '../useProjectStore'
import { useStatusStore } from '../useStatusStore'
import { useTerminalStore } from '../useTerminalStore'
import { useViewStore } from '../useViewStore'

const emptyTimeline = {
  messages: [],
  assistantPlaceholderId: null,
  thinkingPlaceholderId: null,
  pendingModelDisplay: null,
  isLoading: false,
}

// Same hand-rolled api stubs the chatTurn tests use. Listener registrations
// return no-op unsubscribers because send() goes through the full chat-turn
// flow and chatTurn.ts wires them up.
interface ApiStub {
  platform: string
  aiChat: ReturnType<typeof vi.fn>
  aiCancelGeneration: ReturnType<typeof vi.fn>
  aiAskUserResponse: ReturnType<typeof vi.fn>
  aiContextStatus: ReturnType<typeof vi.fn>
  aiCompressToolNoise: ReturnType<typeof vi.fn>
  onAiToken: ReturnType<typeof vi.fn>
  onAiToolCallStart: ReturnType<typeof vi.fn>
  onAiToolCallEnd: ReturnType<typeof vi.fn>
  onAiThinking: ReturnType<typeof vi.fn>
  onAiAskUser: ReturnType<typeof vi.fn>
  onAiInjectedMessage: ReturnType<typeof vi.fn>
  onAiModelSelected: ReturnType<typeof vi.fn>
  onAiStreamReset: ReturnType<typeof vi.fn>
  onAiTodosUpdated: ReturnType<typeof vi.fn>
  session: {
    save: ReturnType<typeof vi.fn>
    load: ReturnType<typeof vi.fn>
    listAll: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  external: { getTranscript: ReturnType<typeof vi.fn> }
  workspaces: { listKnown: ReturnType<typeof vi.fn> }
  readDirectoryTree: ReturnType<typeof vi.fn>
  addRecentProject: ReturnType<typeof vi.fn>
  indexProject: ReturnType<typeof vi.fn>
}

// A single-group list holding the given conversations in `/proj`.
function groupsWith(
  items: Array<{ source: string; id: string; title: string; createdAt: number; updatedAt: number }>
): unknown[] {
  return [{ workspacePath: '/proj', name: 'proj', existsOnDisk: true, lastActivity: 0, items }]
}

function roseItem(id: string, title = 't'): {
  source: string
  id: string
  title: string
  createdAt: number
  updatedAt: number
} {
  return { source: 'rose', id, title, createdAt: 0, updatedAt: 0 }
}

function makeApi(): ApiStub {
  const noopUnsub = (): void => {}
  return {
    platform: 'win32',
    aiChat: vi.fn(async () => ({ content: 'reply', modifiedFiles: [], modelDisplay: 'gpt-5' })),
    aiCancelGeneration: vi.fn(async () => {}),
    aiAskUserResponse: vi.fn(async () => {}),
    aiContextStatus: vi.fn(async () => ({
      estimatedTokens: 100,
      contextLength: 8000,
      percentUsed: 0.0125,
      totalToolSteps: 0,
    })),
    aiCompressToolNoise: vi.fn(async () => null),
    onAiToken: vi.fn(() => noopUnsub),
    onAiToolCallStart: vi.fn(() => noopUnsub),
    onAiToolCallEnd: vi.fn(() => noopUnsub),
    onAiThinking: vi.fn(() => noopUnsub),
    onAiAskUser: vi.fn(() => noopUnsub),
    onAiInjectedMessage: vi.fn(() => noopUnsub),
    onAiModelSelected: vi.fn(() => noopUnsub),
    onAiStreamReset: vi.fn(() => noopUnsub),
    onAiTodosUpdated: vi.fn(() => noopUnsub),
    session: {
      save: vi.fn(async () => {}),
      load: vi.fn(async () => null),
      listAll: vi.fn(async () => ({ groups: [] })),
      delete: vi.fn(async () => {}),
    },
    external: { getTranscript: vi.fn(async () => null) },
    workspaces: { listKnown: vi.fn(async () => []) },
    readDirectoryTree: vi.fn(async () => null),
    addRecentProject: vi.fn(async () => []),
    indexProject: vi.fn(async () => {}),
  }
}

function resetStores(): void {
  useChat.setState({
    ...emptyTimeline,
    inputValue: '',
    isRecording: false,
    searchQuery: '',
    groups: [],
    currentSessionId: null,
    externalView: null,
    workspacePickerOpen: false,
    composerChoice: null,
    snapshot: null,
    contextStatus: null,
    toastDismissed: null,
    isCompressing: false,
  })
}

describe('useChat slice', () => {
  let api: ApiStub

  beforeEach(() => {
    api = makeApi()
    ;(globalThis as unknown as { window: { api: ApiStub } }).window = { api }
    resetStores()
    captureFrame.mockReset()
    captureFrame.mockResolvedValue(null)
    useProjectStore.setState({ rootPath: '/proj' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // vi.spyOn against a zustand state method leaks across tests (later spies
  // wrap earlier ones rather than replacing them), so swap notify with a
  // fresh vi.fn for each test that needs to observe the call.
  function captureNotify(): ReturnType<typeof vi.fn> {
    const fn = vi.fn()
    useStatusStore.setState({ notify: fn })
    return fn
  }

  describe('state', () => {
    it('holds timeline messages on the slice', () => {
      useChat.setState({
        messages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: 0 }],
      })
      expect(useChat.getState().messages).toEqual([
        { id: 'u1', role: 'user', content: 'hi', timestamp: 0 },
      ])
    })

    it('holds inputValue on the slice', () => {
      useChat.getState().setInputValue('draft text')
      expect(useChat.getState().inputValue).toBe('draft text')
    })

    it('holds grouped conversations and currentSessionId on the slice', () => {
      useChat.setState({
        groups: groupsWith([roseItem('s1', 't1')]) as never,
        currentSessionId: 's1',
      })
      const slice = useChat.getState()
      expect(slice.groups).toHaveLength(1)
      expect(slice.groups[0].items).toHaveLength(1)
      expect(slice.currentSessionId).toBe('s1')
    })

    it('holds the consolidated compression snapshot on the slice', () => {
      useChat.setState({
        snapshot: {
          compressedMessages: [{ role: 'system', content: 'summary' }],
          compressedFromCount: 2,
          compressedFromRawCount: 2,
          compressedAt: 100,
          compressedTurnCount: 3,
        },
      })
      const slice = useChat.getState()
      expect(slice.snapshot?.compressedMessages).toEqual([
        { role: 'system', content: 'summary' },
      ])
      expect(slice.snapshot?.compressedFromCount).toBe(2)
      expect(slice.snapshot?.compressedAt).toBe(100)
      expect(slice.snapshot?.compressedTurnCount).toBe(3)
    })
  })

  describe('actions', () => {
    it('setInputValue updates the slice', () => {
      useChat.getState().setInputValue('hello')
      expect(useChat.getState().inputValue).toBe('hello')
    })

    it('send() drives the same timeline transitions as the legacy chatTurn.sendMessage flow', async () => {
      vi.useFakeTimers()
      useChat.getState().setInputValue('hello world')

      const promise = useChat.getState().send()
      await vi.advanceTimersByTimeAsync(0)

      // The legacy chat-turn flow called aiChat with the user message —
      // proxy through send() and assert the same wire shape.
      expect(api.aiChat).toHaveBeenCalledOnce()
      const [messages, rootPath] = api.aiChat.mock.calls[0]
      expect(messages).toHaveLength(1)
      expect(messages[0]).toMatchObject({ role: 'user', content: 'hello world' })
      expect(rootPath).toBe('/proj')

      // A conversation was created and grouped under its Workspace, carrying
      // the active workspacePath.
      const groups = useChat.getState().groups
      expect(groups).toHaveLength(1)
      expect(groups[0].workspacePath).toBe('/proj')
      expect(groups[0].items).toHaveLength(1)
      expect(useChat.getState().currentSessionId).toBe(groups[0].items[0].id)

      await vi.advanceTimersByTimeAsync(250)
      await promise

      // Same post-settle invariants the legacy chatTurn.test.ts asserts:
      // isLoading is false and no streaming placeholder remains. The
      // assistant text itself comes from streaming token events, which
      // this happy-path test does not drive.
      expect(useChat.getState().isLoading).toBe(false)
      expect(useChat.getState().assistantPlaceholderId).toBeNull()
      // The user message landed on the mirrored timeline.
      const messagesAfter = useChat.getState().messages
      expect(messagesAfter.find((m) => m.role === 'user')?.content).toBe(
        'hello world'
      )
    })

    it('send() clears the input field once the message starts sending — via the slice', async () => {
      vi.useFakeTimers()
      useChat.getState().setInputValue('clear me')
      expect(useChat.getState().inputValue).toBe('clear me')

      const promise = useChat.getState().send()
      await vi.advanceTimersByTimeAsync(0)
      expect(useChat.getState().inputValue).toBe('')

      await vi.advanceTimersByTimeAsync(250)
      await promise
    })

    it('cancel() forwards to window.api.aiCancelGeneration with the active sessionId', async () => {
      useChat.setState({ currentSessionId: 'sess-y' })
      await useChat.getState().cancel()
      expect(api.aiCancelGeneration).toHaveBeenCalledWith('sess-y')
    })

    it('startNewConversation() resets the slice for a fresh conversation', async () => {
      useChat.setState({
        groups: groupsWith([roseItem('s1')]) as never,
        currentSessionId: 's1',
        messages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: 0 }],
        externalView: { source: 'claude-code', id: 'x', title: 'x', workspacePath: '/proj', entries: [] } as never,
      })

      // Same workspace → bindWorkspace short-circuits (no readDirectoryTree).
      await useChat.getState().startNewConversation('/proj')

      expect(useChat.getState().currentSessionId).toBeNull()
      expect(useChat.getState().messages).toEqual([])
      expect(useChat.getState().externalView).toBeNull()
    })

    it('compressNow → refreshContextStatus → send substitutes the snapshot on the outgoing wire', async () => {
      vi.useFakeTimers()

      // Seed timeline with one user/assistant pair so the snapshot's
      // prefix is intact and can be substituted on the next send.
      useChat.setState({
        messages: [
          { id: 'u1', role: 'user', content: 'old', timestamp: 0 },
          { id: 'a1', role: 'assistant', content: 'old reply', timestamp: 0 },
        ],
        groups: groupsWith([roseItem('s1')]) as never,
        currentSessionId: 's1',
      })

      // Mock the main-side compression response in the new outcome shape so
      // compressNow installs a snapshot, and the status response so refresh
      // succeeds.
      api.aiCompressToolNoise.mockResolvedValueOnce({
        status: 'compressed',
        result: {
          compressedMessages: [{ role: 'system', content: 'compressed prefix' }],
          compressedFromCount: 2,
          compressedFromRawCount: 2,
          compressedTurnCount: 1,
        },
      })
      api.aiContextStatus.mockResolvedValueOnce({
        estimatedTokens: 50,
        contextLength: 8000,
        percentUsed: 0.00625,
        totalToolSteps: 0,
      })

      await useChat.getState().compressNow()
      // The slice now holds the new snapshot directly.
      expect(useChat.getState().snapshot?.compressedMessages).toEqual([
        { role: 'system', content: 'compressed prefix' },
      ])
      expect(useChat.getState().snapshot?.compressedFromCount).toBe(2)
      expect(useChat.getState().snapshot?.compressedTurnCount).toBe(1)

      // refreshContextStatus reads the snapshot from the slice and writes
      // contextStatus.
      api.aiContextStatus.mockResolvedValueOnce({
        estimatedTokens: 50,
        contextLength: 8000,
        percentUsed: 0.00625,
        totalToolSteps: 0,
      })
      await useChat.getState().refreshContextStatus()
      expect(useChat.getState().contextStatus?.estimatedTokens).toBe(50)

      // Now drive send() and assert the outgoing wire has the snapshot
      // substituted in: the first message should be the compressed prefix
      // (system role) and the trailing user message is the new input.
      useChat.getState().setInputValue('follow-up')
      const promise = useChat.getState().send()
      await vi.advanceTimersByTimeAsync(0)

      expect(api.aiChat).toHaveBeenCalledOnce()
      const sentMessages = api.aiChat.mock.calls[0][0] as Array<{
        role: string
        content: string
      }>
      expect(sentMessages[0]).toMatchObject({ role: 'system', content: 'compressed prefix' })
      expect(sentMessages[sentMessages.length - 1]).toMatchObject({
        role: 'user',
        content: 'follow-up',
      })

      await vi.advanceTimersByTimeAsync(250)
      await promise
    })

    it('compressNow notifies success with turn count when outcome is "compressed"', async () => {
      const notify = captureNotify()
      useChat.setState({
        messages: [
          { id: 'u1', role: 'user', content: 'old', timestamp: 0 },
          { id: 'a1', role: 'assistant', content: 'old reply', timestamp: 0 },
        ],
        groups: groupsWith([roseItem('s1')]) as never,
        currentSessionId: 's1',
      })
      api.aiCompressToolNoise.mockResolvedValueOnce({
        status: 'compressed',
        result: {
          compressedMessages: [{ role: 'system', content: 'sum' }],
          compressedFromCount: 2,
          compressedFromRawCount: 2,
          compressedTurnCount: 4,
        },
      })

      await useChat.getState().compressNow()

      expect(notify).toHaveBeenCalledOnce()
      const [text, opts] = notify.mock.calls[0]
      expect(text).toContain('Compressed 4 older turns')
      expect(opts).toMatchObject({ tone: 'success' })
      expect(useChat.getState().snapshot).not.toBeNull()
    })

    it('compressNow notifies "too short" when the conversation is below the turn threshold', async () => {
      const notify = captureNotify()
      useChat.setState({
        messages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: 0 }],
        groups: groupsWith([roseItem('s1')]) as never,
        currentSessionId: 's1',
      })
      api.aiCompressToolNoise.mockResolvedValueOnce({
        status: 'too-short',
        turnCount: 1,
      })

      await useChat.getState().compressNow()

      expect(notify).toHaveBeenCalledOnce()
      expect(notify.mock.calls[0][0]).toContain('too short to compress')
      expect(notify.mock.calls[0][1]).toMatchObject({ tone: 'info' })
      expect(useChat.getState().snapshot).toBeNull()
    })

    it('compressNow notifies an error when no model is configured', async () => {
      const notify = captureNotify()
      useChat.setState({
        messages: [
          { id: 'u1', role: 'user', content: 'old', timestamp: 0 },
          { id: 'a1', role: 'assistant', content: 'old reply', timestamp: 0 },
        ],
        groups: groupsWith([roseItem('s1')]) as never,
        currentSessionId: 's1',
      })
      api.aiCompressToolNoise.mockResolvedValueOnce({ status: 'no-model' })

      await useChat.getState().compressNow()

      expect(notify).toHaveBeenCalledOnce()
      expect(notify.mock.calls[0][0]).toContain('No model configured')
      expect(notify.mock.calls[0][1]).toMatchObject({ tone: 'error' })
      expect(useChat.getState().snapshot).toBeNull()
    })

    it('compressNow notifies the upstream error when compression fails', async () => {
      const notify = captureNotify()
      useChat.setState({
        messages: [
          { id: 'u1', role: 'user', content: 'old', timestamp: 0 },
          { id: 'a1', role: 'assistant', content: 'old reply', timestamp: 0 },
        ],
        groups: groupsWith([roseItem('s1')]) as never,
        currentSessionId: 's1',
      })
      api.aiCompressToolNoise.mockResolvedValueOnce({
        status: 'failed',
        message: 'invalid api key',
      })

      await useChat.getState().compressNow()

      expect(notify).toHaveBeenCalledOnce()
      expect(notify.mock.calls[0][0]).toContain('Compression failed: invalid api key')
      expect(notify.mock.calls[0][1]).toMatchObject({ tone: 'error' })
      expect(useChat.getState().snapshot).toBeNull()
    })

    it('switchSession round-trips a persisted snapshot including compressedTurnCount', async () => {
      // switchSession resolves the target's Workspace from the grouped list.
      useChat.setState({ groups: groupsWith([roseItem('s2', 'persisted')]) as never })
      api.session.load.mockResolvedValueOnce({
        id: 's2',
        title: 'persisted',
        createdAt: 1,
        updatedAt: 1,
        messages: [{ id: 'u1', role: 'user', content: 'old', timestamp: 0 }],
        compressedMessages: [{ role: 'system', content: 'summary' }],
        compressedFromCount: 1,
        compressedFromRawCount: 1,
        compressedAt: 42,
        compressedTurnCount: 7,
      })

      await useChat.getState().switchSession('s2')

      const snap = useChat.getState().snapshot
      expect(snap).not.toBeNull()
      expect(snap?.compressedTurnCount).toBe(7)
      expect(snap?.compressedAt).toBe(42)
    })

    it('detectEmptyResponseError returns null when the response has content', () => {
      const userMsg: UserMessage = {
        id: 'u1',
        role: 'user',
        content: 'hi',
        timestamp: 0,
      }
      const result = detectEmptyResponseError({
        response: { content: 'reply', modifiedFiles: [] },
        lastMessageId: 'u1',
        userMsg,
        hasAttachment: false,
        isManaged: false,
      })
      expect(result).toBeNull()
    })

    it('detectEmptyResponseError hint for an attachment + local model points at vision-capable alternatives', () => {
      const userMsg: UserMessage = {
        id: 'u1',
        role: 'user',
        content: 'look',
        timestamp: 0,
        attachments: [
          { kind: 'screen', dataUrl: 'data:image/jpeg;base64,xx', mimeType: 'image/jpeg' },
        ],
      }
      const result = detectEmptyResponseError({
        response: { content: '', modifiedFiles: [] },
        lastMessageId: 'u1',
        userMsg,
        hasAttachment: true,
        isManaged: false,
      })
      expect(result).toContain('Error: The model returned an empty response.')
      expect(result).toContain('vision-capable model')
    })

    it('detectEmptyResponseError hint for an attachment + managed host mentions server image support', () => {
      const userMsg: UserMessage = {
        id: 'u1',
        role: 'user',
        content: 'look',
        timestamp: 0,
        attachments: [
          { kind: 'screen', dataUrl: 'data:image/jpeg;base64,xx', mimeType: 'image/jpeg' },
        ],
      }
      const result = detectEmptyResponseError({
        response: { content: '', modifiedFiles: [] },
        lastMessageId: 'u1',
        userMsg,
        hasAttachment: true,
        isManaged: true,
      })
      expect(result).toContain('Server image support is coming soon')
    })

    it('detectEmptyResponseError with no attachment returns the bare error (no hint suffix)', () => {
      const userMsg: UserMessage = {
        id: 'u1',
        role: 'user',
        content: 'hi',
        timestamp: 0,
      }
      const result = detectEmptyResponseError({
        response: { content: '', modifiedFiles: [] },
        lastMessageId: 'u1',
        userMsg,
        hasAttachment: false,
        isManaged: false,
      })
      expect(result).toBe('Error: The model returned an empty response.')
    })

    it('deleteSession() of the active conversation resets the timeline', async () => {
      useChat.setState({
        groups: groupsWith([roseItem('s1')]) as never,
        currentSessionId: 's1',
        messages: [{ id: 'u1', role: 'user', content: 'hi', timestamp: 0 }],
        snapshot: {
          compressedMessages: [{ role: 'system', content: 's' }],
          compressedFromCount: 1,
          compressedFromRawCount: 1,
          compressedAt: 1,
          compressedTurnCount: 2,
        },
      })

      await useChat.getState().deleteSession('s1')

      expect(api.session.delete).toHaveBeenCalledWith('s1')
      expect(useChat.getState().groups).toEqual([]) // empty group pruned
      expect(useChat.getState().currentSessionId).toBeNull()
      expect(useChat.getState().messages).toEqual([])
      expect(useChat.getState().snapshot).toBeNull()
    })
  })

  describe('external-session composer routes', () => {
    const extTranscript = {
      source: 'claude-code' as const,
      id: 'ext-sess-1',
      title: 'Fixing the parser',
      workspacePath: '/proj',
      entries: [
        { kind: 'user_message' as const, content: 'original ask' },
        { kind: 'assistant_message' as const, content: 'original answer' },
      ],
    }

    function stubTerminalAndView(): {
      setPendingCommand: ReturnType<typeof vi.fn>
      initialize: ReturnType<typeof vi.fn>
      setActiveView: ReturnType<typeof vi.fn>
    } {
      const setPendingCommand = vi.fn()
      const initialize = vi.fn(async () => {})
      const setActiveView = vi.fn()
      useTerminalStore.setState({ setPendingCommand, initialize } as never)
      useViewStore.setState({ setActiveView } as never)
      return { setPendingCommand, initialize, setActiveView }
    }

    it('a CLI choice routes send() to the terminal with the resume command and message', async () => {
      const { setPendingCommand, initialize, setActiveView } = stubTerminalAndView()
      useChat.setState({
        externalView: extTranscript as never,
        composerChoice: { kind: 'cli', cli: 'claude', modelFlag: 'opus' },
      })
      useChat.getState().setInputValue("fix the bug in foo's parser")

      await useChat.getState().send()

      expect(setPendingCommand).toHaveBeenCalledWith(
        "claude --resume ext-sess-1 --dangerously-skip-permissions --model opus 'fix the bug in foo''s parser'"
      )
      expect(initialize).toHaveBeenCalledWith('/proj')
      // The resume runs in the background — the user stays in their current
      // view and the transcript stays open.
      expect(setActiveView).not.toHaveBeenCalled()
      expect(useChat.getState().externalView).not.toBeNull()
      expect(useChat.getState().inputValue).toBe('')
      expect(api.aiChat).not.toHaveBeenCalled()
    })

    it('empty input still resumes interactively (no prompt argument)', async () => {
      const { setPendingCommand } = stubTerminalAndView()
      useChat.setState({
        externalView: extTranscript as never,
        composerChoice: { kind: 'cli', cli: 'claude', modelFlag: null },
      })
      useChat.getState().setInputValue('')

      await useChat.getState().send()

      expect(setPendingCommand).toHaveBeenCalledWith(
        'claude --resume ext-sess-1 --dangerously-skip-permissions'
      )
    })

    it('a missing workspace bails with an error toast and opens nothing', async () => {
      const { setPendingCommand, initialize } = stubTerminalAndView()
      const notify = captureNotify()
      api.readDirectoryTree.mockRejectedValue(new Error('ENOENT'))
      useChat.setState({
        externalView: { ...extTranscript, workspacePath: '/gone' } as never,
        composerChoice: { kind: 'cli', cli: 'claude', modelFlag: null },
      })

      await useChat.getState().send()

      expect(notify).toHaveBeenCalledWith(expect.stringContaining('Workspace folder not found'), {
        tone: 'error',
      })
      expect(setPendingCommand).not.toHaveBeenCalled()
      expect(initialize).not.toHaveBeenCalled()
    })

    it('a Rose choice forks the transcript into a new conversation and sends with the picked model', async () => {
      vi.useFakeTimers()
      const model = { provider: 'kimi' as const, modelName: 'kimi-k2-thinking' }
      useChat.setState({
        externalView: extTranscript as never,
        composerChoice: { kind: 'rose', model },
      })
      useChat.getState().setInputValue('continue from here')

      const promise = useChat.getState().send()
      await vi.advanceTimersByTimeAsync(0)

      // The external view was forked into a live Rose conversation.
      expect(useChat.getState().externalView).toBeNull()
      expect(useChat.getState().currentSessionId).not.toBeNull()

      // aiChat received the converted history plus the new prompt, and the
      // picked model as the per-conversation override.
      expect(api.aiChat).toHaveBeenCalledOnce()
      const [messages, rootPath, , modelArg] = api.aiChat.mock.calls[0]
      expect(rootPath).toBe('/proj')
      expect(modelArg).toEqual(model)
      expect(messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user'])
      expect(messages[0]).toMatchObject({ content: 'original ask' })
      expect(messages[2]).toMatchObject({ content: 'continue from here' })

      // The persisted conversation pins the picked model and external title.
      const saved = api.session.save.mock.calls[0][0]
      expect(saved.model).toEqual(model)
      expect(saved.title).toBe('Fixing the parser')
      expect(saved.workspacePath).toBe('/proj')

      await vi.advanceTimersByTimeAsync(250)
      await promise
    })

    it('a CLI choice on an external Codex session uses the codex resume form', async () => {
      const { setPendingCommand } = stubTerminalAndView()
      useChat.setState({
        externalView: { ...extTranscript, source: 'codex', id: 'cx-1' } as never,
        composerChoice: { kind: 'cli', cli: 'codex', modelFlag: null },
      })
      useChat.getState().setInputValue('keep going')

      await useChat.getState().send()

      expect(setPendingCommand).toHaveBeenCalledWith("codex resume cx-1 'keep going'")
    })
  })
})
