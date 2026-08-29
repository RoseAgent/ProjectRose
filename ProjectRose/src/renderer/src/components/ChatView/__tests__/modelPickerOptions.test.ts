import { describe, it, expect } from 'vitest'
import {
  buildPickerGroups,
  defaultChoice,
  choiceId,
  type PickerAvailability
} from '../modelPickerOptions'

function availability(overrides: Partial<PickerAvailability> = {}): PickerAvailability {
  return {
    openaiCompatibleBaseUrl: '',
    openaiCompatibleModel: '',
    ollamaConfigured: false,
    ollamaModels: [],
    ...overrides
  }
}

describe('buildPickerGroups', () => {
  it('returns nothing when neither provider is configured', () => {
    expect(buildPickerGroups(availability())).toEqual([])
  })

  it('offers the configured OpenAI-compatible model', () => {
    const groups = buildPickerGroups(
      availability({
        openaiCompatibleBaseUrl: 'https://api.example.com/v1',
        openaiCompatibleModel: 'example-model'
      })
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('OpenAI-compatible')
    expect(groups[0].options[0].choice).toEqual({
      provider: 'openai-compatible',
      modelName: 'example-model'
    })
  })

  it('requires both endpoint URL and model name', () => {
    expect(
      buildPickerGroups(
        availability({ openaiCompatibleBaseUrl: 'https://api.example.com/v1' })
      )
    ).toEqual([])
  })

  it('lists installed Ollama models when configured', () => {
    const groups = buildPickerGroups(
      availability({ ollamaConfigured: true, ollamaModels: ['llama3', 'qwen3'] })
    )
    expect(groups[0].label).toBe('Ollama')
    expect(groups[0].options.map((option) => option.label)).toEqual(['llama3', 'qwen3'])
  })

  it('orders the compatible endpoint before Ollama', () => {
    const groups = buildPickerGroups(
      availability({
        openaiCompatibleBaseUrl: 'https://api.example.com/v1',
        openaiCompatibleModel: 'example-model',
        ollamaConfigured: true,
        ollamaModels: ['llama3']
      })
    )
    expect(groups.map((group) => group.label)).toEqual(['OpenAI-compatible', 'Ollama'])
  })
})

describe('defaultChoice', () => {
  it('uses the last model even if it is not in the current option list', () => {
    const groups = buildPickerGroups(
      availability({ ollamaConfigured: true, ollamaModels: ['qwen3'] })
    )
    expect(defaultChoice(groups, { provider: 'ollama', modelName: 'llama3' })).toEqual({
      provider: 'ollama',
      modelName: 'llama3'
    })
  })

  it('falls back to the first available option, then null', () => {
    const groups = buildPickerGroups(
      availability({
        openaiCompatibleBaseUrl: 'https://api.example.com/v1',
        openaiCompatibleModel: 'example-model'
      })
    )
    expect(defaultChoice(groups, null)).toEqual({
      provider: 'openai-compatible',
      modelName: 'example-model'
    })
    expect(defaultChoice([], null)).toBeNull()
  })
})

describe('choiceId', () => {
  it('encodes provider and model', () => {
    expect(choiceId({ provider: 'openai-compatible', modelName: 'gpt-4.1' })).toBe(
      'openai-compatible:gpt-4.1'
    )
  })
})
