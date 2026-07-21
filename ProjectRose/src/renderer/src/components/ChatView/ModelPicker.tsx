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
  const kimiModels = useProviderStore((s) => s.kimiModels)
  const kimiModelsError = useProviderStore((s) => s.kimiModelsError)
  const ollamaModels = useProviderStore((s) => s.ollamaModels)
  const bedrockConfigured = useProviderStore((s) => s.bedrockConfigured)
  const bedrockModels = useProviderStore((s) => s.bedrockModels)
  const bedrockModelsError = useProviderStore((s) => s.bedrockModelsError)
  const kimiAuthMethod = useSettingsStore((s) => s.kimiAuthMethod)
  const ollamaBaseUrl = useSettingsStore((s) => s.ollamaBaseUrl)
  const bedrockRegion = useSettingsStore((s) => s.bedrockRegion)

  const kimiAvailable = kimiAuthMethod === 'apikey' ? kimiKey : kimiOauth

  const groups = buildPickerGroups({
    externalSource,
    prLoggedIn,
    kimiAvailable,
    kimiAuthMethod,
    kimiModels,
    ollamaConfigured: !!ollamaBaseUrl.trim(),
    ollamaModels,
    bedrockConfigured,
    bedrockModels
  })

  // Refresh the live model lists each time the menu opens so a freshly pulled
  // Ollama model or a newly-shipped Kimi model shows up without a restart.
  // bedrockRegion is a dep because the reachable Bedrock set is region-scoped:
  // changing region in Settings has to re-list, not reuse the old region's ids.
  useEffect(() => {
    if (!open) return
    if (ollamaBaseUrl.trim()) void useProviderStore.getState().refreshOllamaModels()
    if (kimiAvailable) void useProviderStore.getState().refreshKimiModels()
    if (bedrockConfigured) void useProviderStore.getState().refreshBedrockModels()
  }, [open, ollamaBaseUrl, kimiAvailable, bedrockConfigured, bedrockRegion])

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
          {/* Kimi is configured but its live /models fetch failed (e.g. a 401
              from an invalid key) — say so rather than omitting Kimi entirely. */}
          {kimiAvailable && kimiModels.length === 0 && kimiModelsError && (
            <div className={styles.group}>
              <div className={styles.groupLabel}>Kimi</div>
              <div className={styles.emptyNote}>
                Couldn’t load models — {kimiModelsError}
              </div>
            </div>
          )}
          {/* Same for Bedrock: credentials are stored but the control-plane
              listing failed (bad keys, wrong region, missing IAM permission). */}
          {bedrockConfigured && bedrockModels.length === 0 && bedrockModelsError && (
            <div className={styles.group}>
              <div className={styles.groupLabel}>Amazon Bedrock</div>
              <div className={styles.emptyNote}>
                Couldn’t load models — {bedrockModelsError}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
