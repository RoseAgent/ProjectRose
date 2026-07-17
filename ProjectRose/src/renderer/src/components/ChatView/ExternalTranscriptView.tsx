import clsx from 'clsx'
import { useChat } from '../../stores/useChat'
import { useProjectStore } from '../../stores/useProjectStore'
import { useViewStore } from '../../stores/useViewStore'
import { useTerminalStore } from '../../stores/useTerminalStore'
import { useStatusStore } from '../../stores/useStatusStore'
import type { ExternalTranscript, ExternalTranscriptEntry } from '@shared/externalSession'
import type { ChatMessage, ToolMessage } from '../../types/chatMessages'
import { MessageTimeline } from './MessageTimeline'
import styles from './ExternalTranscriptView.module.css'

// Read-only viewer for an External Session (Claude Code / Codex). It converts
// the parsed transcript into the renderer's ChatMessage shape and renders it
// through the SAME MessageTimeline the live chat panel uses, so an external
// session looks identical to a Rose conversation. Never mutates the source.
export function ExternalTranscriptView({ transcript }: { transcript: ExternalTranscript }): JSX.Element {
  const openWorkspacePicker = useChat((s) => s.openWorkspacePicker)
  const startNewConversation = useChat((s) => s.startNewConversation)
  const workspaceMissing = useProjectStore((s) => s.workspaceMissing)

  const isClaude = transcript.source === 'claude-code'
  const sourceLabel = isClaude ? 'CC' : 'CX'
  const badgeCls = isClaude ? styles.badgeClaude : styles.badgeCodex

  const messages = toChatMessages(transcript.entries)

  function startHere(): void {
    if (workspaceMissing) {
      openWorkspacePicker()
      return
    }
    startNewConversation(transcript.workspacePath)
  }

  // Resume this Claude Code session in ProjectRose's integrated terminal:
  // bind the workspace, drop into editor view with the terminal showing, and
  // queue `claude --resume <sessionId>` to run once the shell is ready.
  async function openInClaude(): Promise<void> {
    await useProjectStore.getState().bindWorkspace(transcript.workspacePath)
    if (useProjectStore.getState().workspaceMissing) {
      useStatusStore
        .getState()
        .notify('Workspace folder not found — can’t resume this session', { tone: 'error' })
      return
    }
    useChat.getState().closeExternalSession()
    // Collapse chat full-width too — otherwise the editor pane (which hosts the
    // terminal) is hidden and only the full-width chat shows. Editor view gates
    // EditorView on `!(activeView === 'editor' && isChatFullWidth)`.
    useViewStore.setState({ isTerminalVisible: true, isChatFullWidth: false })
    useViewStore.getState().setActiveView('editor')
    useTerminalStore.getState().setPendingCommand(`claude --resume ${transcript.id}`)
    // Re-root the terminal at this workspace (dispose+respawn) so the resume
    // runs in the right directory even if a terminal was already open.
    await useTerminalStore.getState().initialize(transcript.workspacePath)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={clsx(styles.badge, badgeCls)}>{sourceLabel}</span>
        <div className={styles.headText}>
          <div className={styles.headTitle}>{transcript.title}</div>
          <div className={styles.headPath} title={transcript.workspacePath}>
            {transcript.workspacePath}
          </div>
        </div>
        <span className={styles.readonly}>read-only</span>
      </div>

      {messages.length === 0 ? (
        <div className={styles.emptyBody}>No messages in this session.</div>
      ) : (
        <MessageTimeline messages={messages} />
      )}
      {transcript.entryCountTruncated && (
        <div className={styles.truncated}>Transcript truncated — showing the first entries only.</div>
      )}

      <div className={styles.footer}>
        {isClaude ? (
          <button
            className={styles.startBtn}
            onClick={openInClaude}
            disabled={workspaceMissing}
            title={
              workspaceMissing
                ? 'Workspace folder not found on disk'
                : `Resume this session with: claude --resume ${transcript.id}`
            }
          >
            {workspaceMissing ? 'Workspace folder not found' : 'Open in Claude →'}
          </button>
        ) : (
          <button className={styles.startBtn} onClick={startHere}>
            {workspaceMissing
              ? 'Workspace folder not found — choose another…'
              : 'Start a Rose conversation in this workspace →'}
          </button>
        )}
      </div>
    </div>
  )
}

// Convert external transcript entries into the renderer's ChatMessage[]. A
// tool_call and its matching tool_result (same toolCallId) merge into a single
// ToolMessage, so tool activity renders exactly like a live turn's tool calls.
function toChatMessages(entries: ExternalTranscriptEntry[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  const toolById = new Map<string, ToolMessage>()
  let seq = 0
  const nextId = (): string => `ext-${++seq}`

  for (const e of entries) {
    const timestamp = e.timestamp ? Date.parse(e.timestamp) || 0 : 0
    switch (e.kind) {
      case 'user_message':
        messages.push({ id: nextId(), role: 'user', content: e.content, timestamp })
        break
      case 'assistant_message':
        messages.push({
          id: nextId(),
          role: 'assistant',
          content: e.content,
          timestamp,
          modelDisplay: e.model,
        })
        break
      case 'assistant_thought':
        messages.push({ id: nextId(), role: 'thinking', content: e.content, timestamp })
        break
      case 'tool_call': {
        const tool: ToolMessage = {
          id: nextId(),
          role: 'tool',
          timestamp,
          toolId: e.toolCallId,
          name: e.toolName,
          params: asParams(e.input),
          result: null,
          error: false,
          pending: false,
        }
        toolById.set(e.toolCallId, tool)
        messages.push(tool)
        break
      }
      case 'tool_result': {
        const tool = toolById.get(e.toolCallId)
        if (tool) {
          // Fill the earlier tool_call in place.
          tool.result = e.output
          tool.error = e.isError === true
        } else {
          // Orphan result (call not seen) — surface it as its own tool cell.
          messages.push({
            id: nextId(),
            role: 'tool',
            timestamp,
            toolId: e.toolCallId,
            name: e.toolName,
            params: {},
            result: e.output,
            error: e.isError === true,
            pending: false,
          })
        }
        break
      }
    }
  }
  return messages
}

function asParams(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  if (input === undefined || input === null) return {}
  return { value: input }
}
