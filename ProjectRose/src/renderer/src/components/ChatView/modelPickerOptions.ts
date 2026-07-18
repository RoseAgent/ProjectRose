import type { ModelConfig } from '@shared/modelConfig'
import type { ExternalSource } from '@shared/externalSession'
import {
  PROJECTROSE_MODEL,
  KIMI_MODEL_OPTIONS,
  KIMI_PLATFORM_MODEL_OPTIONS,
  CLAUDE_MODEL_ALIASES,
  CODEX_MODEL_ALIASES
} from '@shared/modelConfig'

// Pure option-list construction for the composer's ModelPicker. Kept free of
// stores/React so the group rules (CLI options only on matching external
// sessions, availability filtering, default precedence) are unit-testable.

export type PickerChoice =
  // A Rose provider pair — the Conversation runs in-process with this model.
  | { kind: 'rose'; model: ModelConfig }
  // Resume the external session via its CLI in the integrated terminal.
  // `modelFlag` is the --model value; null omits the flag (CLI default).
  | { kind: 'cli'; cli: 'claude' | 'codex'; modelFlag: string | null }

export interface PickerOption {
  id: string
  label: string
  choice: PickerChoice
}

export interface PickerGroup {
  label: string
  options: PickerOption[]
}

export function choiceId(choice: PickerChoice): string {
  return choice.kind === 'rose'
    ? `rose:${choice.model.provider}:${choice.model.modelName}`
    : `cli:${choice.cli}:${choice.modelFlag ?? 'default'}`
}

export interface PickerAvailability {
  // Which external session (if any) the composer is attached to — decides
  // whether a CLI group appears, and which one.
  externalSource: ExternalSource | null
  prLoggedIn: boolean
  kimiAvailable: boolean
  kimiAuthMethod: 'oauth' | 'apikey'
  ollamaConfigured: boolean
  ollamaModels: string[]
}

export function buildPickerGroups(a: PickerAvailability): PickerGroup[] {
  const groups: PickerGroup[] = []

  // CLI resume options come first — on an external session they're the
  // natural default. Never offered on Rose conversations (there's no session
  // to resume).
  if (a.externalSource === 'claude-code') {
    groups.push({
      label: 'Claude',
      options: CLAUDE_MODEL_ALIASES.map((m) => ({
        id: choiceId({ kind: 'cli', cli: 'claude', modelFlag: m.flag }),
        label: m.label,
        choice: { kind: 'cli', cli: 'claude', modelFlag: m.flag }
      }))
    })
  } else if (a.externalSource === 'codex') {
    groups.push({
      label: 'Codex',
      options: CODEX_MODEL_ALIASES.map((m) => ({
        id: choiceId({ kind: 'cli', cli: 'codex', modelFlag: m.flag }),
        label: m.label,
        choice: { kind: 'cli', cli: 'codex', modelFlag: m.flag }
      }))
    })
  }

  if (a.prLoggedIn) {
    groups.push({
      label: 'ProjectRose',
      options: [
        {
          id: choiceId({ kind: 'rose', model: PROJECTROSE_MODEL }),
          label: 'Managed',
          choice: { kind: 'rose', model: PROJECTROSE_MODEL }
        }
      ]
    })
  }

  if (a.kimiAvailable) {
    const table = a.kimiAuthMethod === 'apikey' ? KIMI_PLATFORM_MODEL_OPTIONS : KIMI_MODEL_OPTIONS
    groups.push({
      label: 'Kimi',
      options: table.map((m) => {
        const model: ModelConfig = { provider: 'kimi', modelName: m.id }
        return { id: choiceId({ kind: 'rose', model }), label: m.label, choice: { kind: 'rose', model } }
      })
    })
  }

  if (a.ollamaConfigured && a.ollamaModels.length > 0) {
    groups.push({
      label: 'Ollama',
      options: a.ollamaModels.map((name) => {
        const model: ModelConfig = { provider: 'ollama', modelName: name }
        return { id: choiceId({ kind: 'rose', model }), label: name, choice: { kind: 'rose', model } }
      })
    })
  }

  return groups
}

/**
 * The picker's initial selection. External sessions default to resuming with
 * their own CLI; Rose conversations use the user's most recent pick (trusted
 * even before the Ollama model list has been fetched — a stale pick fails the
 * send with an actionable message, which beats silently switching provider),
 * then the first available option in group order (ProjectRose → Kimi →
 * Ollama). Null when nothing is available.
 */
export function defaultChoice(groups: PickerGroup[], lastModel: ModelConfig | null): PickerChoice | null {
  const flat = groups.flatMap((g) => g.options)
  const cliDefault = flat.find((o) => o.choice.kind === 'cli' && o.choice.modelFlag === null)
  if (cliDefault) return cliDefault.choice

  if (lastModel) return { kind: 'rose', model: lastModel }
  return flat.length > 0 ? flat[0].choice : null
}
