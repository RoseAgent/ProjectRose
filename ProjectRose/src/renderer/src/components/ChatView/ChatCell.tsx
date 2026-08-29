import { useState, type MouseEvent } from 'react'
import type { UserMessage, AssistantMessage, ThinkingMessage } from '../../types/chatMessages'
import { useStatusStore } from '../../stores/useStatusStore'
import clsx from 'clsx'
import styles from './ChatCell.module.css'

interface ChatCellProps {
  message: UserMessage | AssistantMessage | ThinkingMessage
}

const stripEdgeNewlines = (s: string): string => s.replace(/^[\r\n]+|[\r\n]+$/g, '')

export function ChatCell({ message }: ChatCellProps): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const displayContent = stripEdgeNewlines(message.content)

  const handleCopy = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(message.content)
      useStatusStore.getState().notify('Copied to clipboard', { tone: 'success' })
    } catch {
      useStatusStore.getState().notify('Clipboard unavailable', { tone: 'error' })
    }
  }

  if (message.role === 'thinking') {
    return (
      <div className={styles.thinkingCell}>
        <div
          className={styles.thinkingHeader}
          onClick={() => setExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setExpanded((v) => !v)
            }
          }}
        >
          <span className={styles.thinkingLabel}>
            {message.streaming ? 'Thinking...' : 'Thinking'}
          </span>
          <span className={styles.headerActions}>
            <button
              className={styles.copyBtn}
              onClick={handleCopy}
              type="button"
              title="Copy thinking"
            >
              Copy
            </button>
            <span className={styles.thinkingChevron}>{expanded ? '▲' : '▼'}</span>
          </span>
        </div>
        {expanded && (
          <div className={styles.thinkingContent}>{displayContent}</div>
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
      <div
        className={styles.cellHeader}
        onClick={() => !isStreaming && setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isStreaming) {
            e.preventDefault()
            setExpanded((v) => !v)
          }
        }}
      >
        <span className={isUser ? styles.userLabel : styles.assistantLabel}>
          {isUser ? 'Input' : 'Output'}
          {!isUser && (message as AssistantMessage).modelDisplay && (
            <span className={styles.modelChip}> · {(message as AssistantMessage).modelDisplay}</span>
          )}
        </span>
        <span className={styles.headerActions}>
          <button
            className={styles.copyBtn}
            onClick={handleCopy}
            type="button"
            title="Copy message"
          >
            Copy
          </button>
          <span className={styles.thinkingChevron}>{expanded ? '▲' : '▼'}</span>
        </span>
      </div>
      {expanded && (
        <div className={styles.cellContent}>
          {!isUser && (message as AssistantMessage).fallbackNotice && (
            <div className={styles.fallbackNotice}>{(message as AssistantMessage).fallbackNotice}</div>
          )}
          {displayContent}
          {isStreaming && (
            <span className={styles.streamCursor} aria-hidden="true" />
          )}
          {isUser && (message as UserMessage).attachments?.map((a, i) => (
            <img
              key={i}
              src={a.dataUrl}
              className={styles.attachmentImg}
              alt={a.kind === 'screen' ? 'Shared screen' : 'Camera frame'}
              onClick={() => window.open(a.dataUrl, '_blank')}
            />
          ))}
        </div>
      )}
    </div>
  )
}
