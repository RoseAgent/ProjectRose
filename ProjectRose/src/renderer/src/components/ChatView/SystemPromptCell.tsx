import { useState, useEffect } from 'react'
import styles from './ChatCell.module.css'
import promptStyles from './SystemPromptCell.module.css'

interface SystemPromptCellProps {
  rootPath: string
}

export function SystemPromptCell({ rootPath }: SystemPromptCellProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [prompt, setPrompt] = useState<string | null>(null)

  useEffect(() => {
    setPrompt(null)
    window.api.aiGetSystemPrompt(rootPath).then(setPrompt).catch(() => {})
  }, [rootPath])

  if (!prompt) return <></>

  return (
    <div className={promptStyles.cell}>
      <button
        className={styles.thinkingHeader}
        onClick={() => setExpanded((v) => !v)}
        type="button"
      >
        <span className={promptStyles.label}>System Prompt</span>
        <span className={styles.thinkingChevron}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className={styles.thinkingContent}>{prompt}</div>
      )}
    </div>
  )
}
