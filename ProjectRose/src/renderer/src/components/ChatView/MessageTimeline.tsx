import type {
  ChatMessage,
  ToolMessage,
  AskUserMessage,
  InjectedMessage,
  AssistantMessage,
} from '../../types/chatMessages'
import { ChatCell } from './ChatCell'
import { ToolCallGroupCell } from './ToolCallGroupCell'
import { AskUserCell } from './AskUserCell'
import { InjectedCell } from './InjectedCell'
import styles from './ChatPanel.module.css'

// The message-rendering core shared by the live chat panel and the read-only
// External Session viewer, so both render conversations identically. Consecutive
// tool messages collapse into a single ToolCallGroupCell exactly as in ChatPanel.

type RenderItem =
  | { type: 'message'; message: Exclude<ChatMessage, ToolMessage> }
  | { type: 'tool-group'; messages: ToolMessage[]; key: string }

// Matches ChatPanel.hasVisibleContent so the two timelines hide the same cells.
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

function renderItem(item: RenderItem): JSX.Element {
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

export function MessageTimeline({
  messages,
  tailRef,
  containerRef,
  onScroll,
}: {
  messages: ChatMessage[]
  // Optional anchor rendered after the last cell, inside the scroll container —
  // callers point scrollIntoView at it to follow a live-updating transcript.
  tailRef?: React.RefObject<HTMLDivElement | null>
  // Optional handle on the scroll container itself, for at-bottom detection.
  containerRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: React.UIEventHandler<HTMLDivElement>
}): JSX.Element {
  return (
    <div className={styles.messages} ref={containerRef} onScroll={onScroll}>
      {groupMessages(messages).map(renderItem)}
      {tailRef && <div ref={tailRef} />}
    </div>
  )
}
