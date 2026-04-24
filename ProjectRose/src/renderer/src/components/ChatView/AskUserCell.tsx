import { useState } from 'react'
import { useChatStore } from '../../stores/useChatStore'
import type { AskUserMessage } from '../../stores/useChatStore'
import styles from './AskUserCell.module.css'

export function AskUserCell({ message }: { message: AskUserMessage }): JSX.Element {
  const answerAskUser = useChatStore((s) => s.answerAskUser)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [customAnswer, setCustomAnswer] = useState('')

  const isAnswered = message.answer !== null

  const handleToggle = (option: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(option)) next.delete(option)
      else next.add(option)
      return next
    })
  }

  const handleSubmit = (): void => {
    const parts: string[] = []
    if (selected.size > 0) parts.push([...selected].join(', '))
    if (customAnswer.trim()) parts.push(customAnswer.trim())
    if (parts.length === 0) return
    answerAskUser(message.questionId, parts.join('; '))
  }

  return (
    <div className={styles.container}>
      <div className={styles.label}>Question from AI</div>
      <div className={styles.question}>{message.question}</div>
      {isAnswered ? (
        <div className={styles.answered}>
          <span className={styles.answeredLabel}>Your answer:</span>
          <span className={styles.answeredText}>{message.answer}</span>
        </div>
      ) : (
        <div className={styles.form}>
          {message.options.length > 0 && (
            <div className={styles.options}>
              {message.options.map((opt) => (
                <label key={opt} className={styles.optionLabel}>
                  <input
                    type="checkbox"
                    checked={selected.has(opt)}
                    onChange={() => handleToggle(opt)}
                    className={styles.checkbox}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          )}
          <div className={styles.customRow}>
            <input
              type="text"
              className={styles.customInput}
              placeholder="Or type your answer..."
              value={customAnswer}
              onChange={(e) => setCustomAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            />
            <button
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={selected.size === 0 && !customAnswer.trim()}
            >
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
