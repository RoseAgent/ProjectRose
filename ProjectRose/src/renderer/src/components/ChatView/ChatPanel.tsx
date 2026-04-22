import { useEffect, useRef } from 'react'
import { useChatStore } from '../../stores/useChatStore'
import type { ChatMessage, ToolMessage } from '../../stores/useChatStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { ChatCell } from './ChatCell'
import { ToolCallGroupCell } from './ToolCallGroupCell'
import { ChatInput } from './ChatInput'
import styles from './ChatPanel.module.css'

type RenderItem =
  | { type: 'message'; message: Exclude<ChatMessage, ToolMessage> }
  | { type: 'tool-group'; messages: ToolMessage[]; key: string }

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
      items.push({ type: 'message', message: msg as Exclude<ChatMessage, ToolMessage> })
      i++
    }
  }
  return items
}

export function ChatPanel(): JSX.Element {
  const messages = useChatStore((s) => s.messages)
  const isLoading = useChatStore((s) => s.isLoading)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const rootPath = useProjectStore((s) => s.rootPath)
  const loadSessions = useChatStore((s) => s.loadSessions)

  useEffect(() => {
    if (rootPath) loadSessions(rootPath)
  }, [rootPath])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const items = groupMessages(messages)

  return (
    <div className={styles.chatPanel}>
      {messages.length === 0 ? (
        <div className={styles.empty}>Start a conversation with the AI assistant</div>
      ) : (
        <div className={styles.messages}>
          {items.map((item) =>
            item.type === 'tool-group'
              ? <ToolCallGroupCell key={item.key} messages={item.messages} />
              : <ChatCell key={item.message.id} message={item.message} />
          )}
          {isLoading && (
            <div className={styles.loading}>Generating response...</div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}
      <ChatInput />
    </div>
  )
}
