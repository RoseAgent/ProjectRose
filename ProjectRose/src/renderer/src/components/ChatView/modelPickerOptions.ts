import type { ModelConfig } from '@shared/modelConfig'

// Pure option-list construction for the composer's ModelPicker.
export type PickerChoice = ModelConfig

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
  return `${choice.provider}:${choice.modelName}`
}

export interface PickerAvailability {
  openaiCompatibleBaseUrl: string
  openaiCompatibleModel: string
  ollamaConfigured: boolean
  ollamaModels: string[]
}

export function buildPickerGroups(a: PickerAvailability): PickerGroup[] {
  const groups: PickerGroup[] = []

  const compatibleModel = a.openaiCompatibleModel.trim()
  if (a.openaiCompatibleBaseUrl.trim() && compatibleModel) {
    const choice: ModelConfig = {
      provider: 'openai-compatible',
      modelName: compatibleModel
    }
    groups.push({
      label: 'OpenAI-compatible',
      options: [{ id: choiceId(choice), label: compatibleModel, choice }]
    })
  }

  if (a.ollamaConfigured && a.ollamaModels.length > 0) {
    groups.push({
      label: 'Ollama',
      options: a.ollamaModels.map((name) => {
        const choice: ModelConfig = { provider: 'ollama', modelName: name }
        return { id: choiceId(choice), label: name, choice }
      })
    })
  }

  return groups
}

export function defaultChoice(
  groups: PickerGroup[],
  lastModel: ModelConfig | null
): PickerChoice | null {
  if (lastModel) return lastModel
  const first = groups[0]?.options[0]
  return first?.choice ?? null
}
