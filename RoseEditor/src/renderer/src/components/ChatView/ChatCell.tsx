import { useState } from 'react'
import type { UserMessage, AssistantMessage, ThinkingMessage } from '../../stores/useChatStore'
import clsx from 'clsx'
import styles from './ChatCell.module.css'

interface ChatCellProps {
  message: UserMessage | AssistantMessage | ThinkingMessage
}

export function ChatCell({ message }: ChatCellProps): JSX.Element {
  const [expanded, setExpanded] = useState(true)

  if (message.role === 'thinking') {
    return (
      <div className={styles.thinkingCell}>
        <button
          className={styles.thinkingHeader}
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          <span className={styles.thinkingLabel}>
            {message.streaming ? 'Thinking...' : 'Thinking'}
          </span>
          <span className={styles.thinkingChevron}>{expanded ? '▲' : '▼'}</span>
        </button>
        {expanded && (
          <div className={styles.thinkingContent}>{message.content}</div>
        )}
      </div>
    )
  }

  const isUser = message.role === 'user'
  const isStreaming = message.role === 'assistant' && message.streaming

  return (
    <div
      className={clsx(
        styles.cell,
        isUser ? styles.userCell : styles.assistantCell
      )}
    >
      <button
        className={styles.cellHeader}
        onClick={() => !isStreaming && setExpanded((v) => !v)}
        type="button"
      >
        <span className={isUser ? styles.userLabel : styles.assistantLabel}>
          {isUser ? 'Input' : 'Output'}
          {!isUser && (message as AssistantMessage).modelDisplay && (
            <span className={styles.modelChip}> · {(message as AssistantMessage).modelDisplay}</span>
          )}
        </span>
        <span className={styles.thinkingChevron}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className={styles.cellContent}>
          {!isUser && (message as AssistantMessage).fallbackNotice && (
            <div className={styles.fallbackNotice}>{(message as AssistantMessage).fallbackNotice}</div>
          )}
          {message.content}
          {isStreaming && (
            <span className={styles.streamCursor} aria-hidden="true" />
          )}
        </div>
      )}
    </div>
  )
}
