import { useEffect, useRef, useState } from 'react'
import { useChat } from '../../stores/useChat'
import { useProviderStore } from '../../stores/useProviderStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { buildPickerGroups, choiceId, type PickerChoice } from './modelPickerOptions'
import styles from './ModelPicker.module.css'

function choiceLabel(choice: PickerChoice | null): string {
  if (!choice) return 'NO MODEL'
  if (choice.kind === 'cli') {
    const cli = choice.cli === 'claude' ? 'CLAUDE' : 'CODEX'
    return `${cli} · ${choice.modelFlag ?? 'default'}`
  }
  const { provider, modelName } = choice.model
  if (provider === 'projectrose') return 'PROJECTROSE · managed'
  return `${provider.toUpperCase()} · ${modelName}`
}

/**
 * The composer's provider+model selector. Lists the Rose providers that are
 * actually usable right now; on an external session it additionally leads
 * with that session's CLI (Claude / Codex) resume options.
 */
export function ModelPicker(): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const composerChoice = useChat((s) => s.composerChoice)
  const setComposerChoice = useChat((s) => s.setComposerChoice)
  const externalSource = useChat((s) => s.externalView?.source ?? null)
  const lastModel = useSettingsStore((s) => s.lastModel)

  const prLoggedIn = useProviderStore((s) => s.prLoggedIn)
  const kimiOauth = useProviderStore((s) => s.kimiOauth)
  const kimiKey = useProviderStore((s) => s.kimiKey)
  const ollamaModels = useProviderStore((s) => s.ollamaModels)
  const kimiAuthMethod = useSettingsStore((s) => s.kimiAuthMethod)
  const ollamaBaseUrl = useSettingsStore((s) => s.ollamaBaseUrl)

  const groups = buildPickerGroups({
    externalSource,
    prLoggedIn,
    kimiAvailable: kimiAuthMethod === 'apikey' ? kimiKey : kimiOauth,
    kimiAuthMethod,
    ollamaConfigured: !!ollamaBaseUrl.trim(),
    ollamaModels
  })

  // Refresh the installed-model list each time the menu opens so a freshly
  // pulled Ollama model shows up without an app restart.
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

  // No explicit pick yet → the send path falls back to the last-used model;
  // show that so the button reflects what a send would actually use.
  const effectiveChoice: PickerChoice | null =
    composerChoice ?? (lastModel ? { kind: 'rose', model: lastModel } : null)
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
              No providers available — sign in or configure one in Settings.
            </div>
          )}
          {groups.map((g) => (
            <div key={g.label} className={styles.group}>
              <div className={styles.groupLabel}>{g.label}</div>
              {g.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`${styles.option} ${o.id === selectedId ? styles.optionSelected : ''}`}
                  onClick={() => {
                    setComposerChoice(o.choice)
                    setOpen(false)
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
