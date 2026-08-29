import { useEffect, useRef, useState } from 'react'
import { useChat } from '../../stores/useChat'
import { useProviderStore } from '../../stores/useProviderStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { buildPickerGroups, choiceId, type PickerChoice } from './modelPickerOptions'
import styles from './ModelPicker.module.css'

function choiceLabel(choice: PickerChoice | null): string {
  if (!choice) return 'NO MODEL'
  const provider = choice.provider === 'openai-compatible' ? 'OPENAI-COMPATIBLE' : 'OLLAMA'
  return `${provider} · ${choice.modelName}`
}

export function ModelPicker(): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const composerChoice = useChat((s) => s.composerChoice)
  const setComposerChoice = useChat((s) => s.setComposerChoice)
  const lastModel = useSettingsStore((s) => s.lastModel)
  const ollamaBaseUrl = useSettingsStore((s) => s.ollamaBaseUrl)
  const openaiCompatibleBaseUrl = useSettingsStore((s) => s.openaiCompatibleBaseUrl)
  const openaiCompatibleModel = useSettingsStore((s) => s.openaiCompatibleModel)
  const ollamaModels = useProviderStore((s) => s.ollamaModels)

  const groups = buildPickerGroups({
    openaiCompatibleBaseUrl,
    openaiCompatibleModel,
    ollamaConfigured: !!ollamaBaseUrl.trim(),
    ollamaModels
  })

  useEffect(() => {
    if (open && ollamaBaseUrl.trim()) {
      void useProviderStore.getState().refreshOllamaModels()
    }
  }, [open, ollamaBaseUrl])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const effectiveChoice: PickerChoice | null = composerChoice ?? lastModel
  const selectedId = effectiveChoice ? choiceId(effectiveChoice) : null

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        title="Choose the provider and model for this conversation"
      >
        <span className={styles.triggerLabel}>{choiceLabel(effectiveChoice)}</span>
        <span className={styles.caret}>{open ? '▾' : '▴'}</span>
      </button>

      {open && (
        <div className={styles.menu}>
          {groups.length === 0 && (
            <div className={styles.emptyNote}>
              Configure Ollama or an OpenAI-compatible endpoint in Settings.
            </div>
          )}
          {groups.map((group) => (
            <div key={group.label} className={styles.group}>
              <div className={styles.groupLabel}>{group.label}</div>
              {group.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.option} ${option.id === selectedId ? styles.optionSelected : ''}`}
                  onClick={() => {
                    setComposerChoice(option.choice)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
