import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { useChat } from '../../stores/useChat'
import type {
  ChatMessage,
  ToolMessage,
  AssistantMessage,
  AskUserMessage,
  InjectedMessage,
} from '../../types/chatMessages'
import { useActiveListeningStore } from '../../stores/useActiveListeningStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useStatusStore } from '../../stores/useStatusStore'
import { useViewStore } from '../../stores/useViewStore'
import { ChatCell } from './ChatCell'
import { ToolCallGroupCell } from './ToolCallGroupCell'
import { AskUserCell } from './AskUserCell'
import { InjectedCell } from './InjectedCell'
import { SystemPromptCell } from './SystemPromptCell'
import { ChatInput } from './ChatInput'
import { CompressionToast } from './CompressionToast'
import { CompressedTurns } from './CompressedTurns'
import { ContextStatusBar } from './ContextStatusBar'
import { TodoChecklist } from './TodoChecklist'
import { TranscriptView } from './TranscriptView'
import { TtsAutoPlayer } from './TtsAutoPlayer'
import type { CompressionSnapshot } from '../../types/chatMessages'
import styles from './ChatPanel.module.css'

type RenderItem =
  | { type: 'message'; message: Exclude<ChatMessage, ToolMessage> }
  | { type: 'tool-group'; messages: ToolMessage[]; key: string }

function formatToolCall(msg: ToolMessage): string {
  let params = ''
  try {
    params = JSON.stringify(msg.params, null, 2)
  } catch {
    params = String(msg.params)
  }
  const status = msg.pending ? 'running' : msg.error ? 'error' : 'done'
  const result =
    msg.result == null
      ? '(no result)'
      : msg.result
  return `[Tool: ${msg.name}] (${status})\nParams: ${params}\nResult: ${result}`
}

function formatChatForCopy(messages: ChatMessage[]): string {
  const parts: string[] = []
  for (const msg of messages) {
    if (msg.role === 'user') {
      parts.push(`[User]\n${msg.content}`)
    } else if (msg.role === 'assistant') {
      parts.push(`[Assistant]\n${msg.content}`)
    } else if (msg.role === 'tool') {
      parts.push(formatToolCall(msg))
    } else if (msg.role === 'ask_user') {
      const ans = msg.answer ? `\nAnswer: ${msg.answer}` : ''
      parts.push(`[Ask]\n${msg.question}${ans}`)
    } else if (msg.role === 'injected') {
      parts.push(`[Injected by ${msg.extensionName}]\n${msg.content}`)
    }
  }
  return parts.join('\n\n')
}

// Assistant/thinking cells with no text and nothing else to show (no streaming
// cursor, no fallback notice) render as blank "Output"/"Thinking" boxes. The
// agent can finish a step with tool calls alone, so suppress those rather than
// leak an empty cell into the timeline.
function hasVisibleContent(msg: ChatMessage): boolean {
  if (msg.role === 'thinking') {
    return msg.streaming === true || msg.content.length > 0
  }
  if (msg.role === 'assistant') {
    const a = msg as AssistantMessage
    return a.streaming === true || a.content.length > 0 || !!a.fallbackNotice
  }
  return true
}

function groupMessages(messages: ChatMessage[]): RenderItem[] {
  const items: RenderItem[] = []
  let i = 0
  while (i < messages.length) {
    const msg = messages[i]
    if (msg.role === 'tool') {
      const group: ToolMessage[] = []
      while (i < messages.length && messages[i].role === 'tool') {
        group.push(messages[i] as ToolMessage)
        i++
      }
      items.push({ type: 'tool-group', messages: group, key: group[0].id })
    } else {
      if (hasVisibleContent(msg)) {
        items.push({ type: 'message', message: msg as Exclude<ChatMessage, ToolMessage> })
      }
      i++
    }
  }
  return items
}

// Split the rendered items at the snapshot boundary. Items before it are the
// turns the LLM now sees only as a summary — they get collapsed behind a single
// divider so it's obvious they were compressed. Items at/after the boundary are
// the live conversation the LLM still sees verbatim. With no snapshot (or a
// zero/empty boundary) everything is live.
function partitionByCompression(
  items: RenderItem[],
  messages: ChatMessage[],
  snapshot: CompressionSnapshot | null
): { compressed: RenderItem[]; live: RenderItem[] } {
  if (!snapshot) return { compressed: [], live: items }
  const boundary = snapshot.compressedFromRawCount
  if (boundary <= 0 || messages.length === 0) return { compressed: [], live: items }
  const idToRawIndex = new Map<string, number>()
  for (let i = 0; i < messages.length; i++) idToRawIndex.set(messages[i].id, i)
  const compressed: RenderItem[] = []
  const live: RenderItem[] = []
  for (const item of items) {
    const firstId = item.type === 'message' ? item.message.id : item.messages[0].id
    const idx = idToRawIndex.get(firstId) ?? -1
    // Unknown indices (shouldn't happen) stay live so nothing is hidden.
    if (idx >= 0 && idx < boundary) compressed.push(item)
    else live.push(item)
  }
  return { compressed, live }
}

// `primary` marks the single visible ChatPanel. Two instances stay mounted at
// once (the editor rail and the chat-mode panel) so their scroll
// survives view switches, but only the visible one may own the TTS/compression
// singletons — otherwise TTS double-plays and toasts render twice. Both live
// inside a positioned `.chatPanel`, so the singletons can't simply be hoisted
// to the app root without breaking their absolute positioning.
export function ChatPanel({ primary = true }: { primary?: boolean } = {}): JSX.Element {
  const messages = useChat((s) => s.messages)
  const isLoading = useChat((s) => s.isLoading)
  const snapshot = useChat((s) => s.snapshot)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const rootPath = useProjectStore((s) => s.rootPath)
  const mode = useActiveListeningStore((s) => s.mode)
  const isActive = useActiveListeningStore((s) => s.isActive)
  const setMode = useActiveListeningStore((s) => s.setMode)

  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const ollamaBaseUrl = useSettingsStore((s) => s.ollamaBaseUrl)
  const openaiCompatibleBaseUrl = useSettingsStore((s) => s.openaiCompatibleBaseUrl)
  const openaiCompatibleModel = useSettingsStore((s) => s.openaiCompatibleModel)
  const setActiveView = useViewStore((s) => s.setActiveView)
  const setSettingsTarget = useViewStore((s) => s.setSettingsTarget)
  const activeView = useViewStore((s) => s.activeView)
  const isChatFullWidth = useViewStore((s) => s.isChatFullWidth)
  const toggleChatFullWidth = useViewStore((s) => s.toggleChatFullWidth)
  const showExpandToggle = activeView === 'chat'

  const setupNeeded =
    settingsLoaded &&
    !ollamaBaseUrl.trim() &&
    !(openaiCompatibleBaseUrl.trim() && openaiCompatibleModel.trim())

  const openAgentSettings = (): void => {
    setSettingsTarget('providers')
    setActiveView('settings')
  }

  const handleCopyAll = async (): Promise<void> => {
    const text = formatChatForCopy(messages)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      useStatusStore.getState().notify('Copied conversation', { tone: 'success' })
    } catch {
      useStatusStore.getState().notify('Clipboard unavailable', { tone: 'error' })
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const { compressed, live } = partitionByCompression(groupMessages(messages), messages, snapshot)

  const renderItem = (item: RenderItem): JSX.Element => {
    if (item.type === 'tool-group') {
      return <ToolCallGroupCell key={item.key} messages={item.messages} />
    }
    if (item.message.role === 'ask_user') {
      return <AskUserCell key={item.message.id} message={item.message as AskUserMessage} />
    }
    if (item.message.role === 'injected') {
      return <InjectedCell key={item.message.id} message={item.message as InjectedMessage} />
    }
    return <ChatCell key={item.message.id} message={item.message} />
  }

  return (
    <div className={clsx(styles.chatPanel, isChatFullWidth && styles.chatPanelFullWidth)}>
      <div className={styles.panelHeader}>
        {showExpandToggle && (
          <button
            className={styles.expandBtn}
            onClick={toggleChatFullWidth}
            title={isChatFullWidth ? 'Collapse chat panel' : 'Expand chat to full width'}
            aria-label={isChatFullWidth ? 'Collapse chat panel' : 'Expand chat to full width'}
            type="button"
          >
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points={isChatFullWidth ? '9 6 15 12 9 18' : '15 6 9 12 15 18'} />
            </svg>
          </button>
        )}
        <button
          className={clsx(styles.toggleBtn, mode === 'chat' && styles.toggleBtnActive)}
          onClick={() => setMode('chat')}
        >
          CHAT
        </button>
        <button
          className={clsx(styles.toggleBtn, mode === 'transcript' && styles.toggleBtnActive)}
          onClick={() => setMode('transcript')}
        >
          TRANSCRIPT
        </button>
        {isActive && <span className={styles.liveChip}><span className={styles.liveDot} />LIVE</span>}
        <button
          className={clsx(styles.copyChatBtn, !isActive && styles.copyChatBtnPushRight)}
          onClick={handleCopyAll}
          disabled={messages.length === 0}
          title="Copy entire chat"
          type="button"
        >
          COPY CHAT
        </button>
      </div>

      {setupNeeded && (
        <div className={styles.setupBanner}>
          <span className={styles.setupBannerDot} />
          <div className={styles.setupBannerText}>
            <div className={styles.setupBannerTitle}>SETUP REQUIRED</div>
            <div className={styles.setupBannerDesc}>
              Configure Ollama or an OpenAI-compatible endpoint before chatting,
              then pick a model from the composer below.
            </div>
            <button type="button" className={styles.setupBannerBtn} onClick={openAgentSettings}>
              OPEN PROVIDER SETTINGS →
            </button>
          </div>
        </div>
      )}

      {mode === 'chat' ? (
        <div className={styles.messages}>
          {rootPath && <SystemPromptCell rootPath={rootPath} />}
          {messages.length === 0 ? (
            <div className={styles.empty}>Start a conversation with the AI assistant</div>
          ) : (
            <>
              {snapshot && compressed.length > 0 && (
                <CompressedTurns snapshot={snapshot}>
                  {compressed.map(renderItem)}
                </CompressedTurns>
              )}
              {live.map(renderItem)}
              {isLoading && (
                <div className={styles.loading}>Generating response...</div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      ) : (
        <TranscriptView />
      )}

      <TodoChecklist />
      <ContextStatusBar />
      <ChatInput />
      {primary && <CompressionToast />}
      {primary && <TtsAutoPlayer />}
    </div>
  )
}
