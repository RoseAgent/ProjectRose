import { describe, it, expect } from 'vitest'
import { validateModelCredentials, pickActiveModel } from '../modelSelection'
import type { AppSettings } from '../settingsService'

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    openaiCompatibleBaseUrl: '',
    openaiCompatibleModel: '',
    ...overrides
  } as AppSettings
}

describe('validateModelCredentials', () => {
  it('allows Ollama without credentials', async () => {
    await expect(
      validateModelCredentials({ provider: 'ollama', modelName: 'llama3' }, settings())
    ).resolves.toBeUndefined()
  })

  it('requires a base URL for an OpenAI-compatible model', async () => {
    await expect(
      validateModelCredentials(
        { provider: 'openai-compatible', modelName: 'gpt-4.1-mini' },
        settings()
      )
    ).rejects.toThrow(/base URL/)
  })

  it('rejects unknown persisted provider values', async () => {
    await expect(
      validateModelCredentials(
        { provider: 'retired-provider', modelName: 'old-model' } as never,
        settings({ openaiCompatibleBaseUrl: 'http://localhost:8000/v1' })
      )
    ).rejects.toThrow(/Unsupported model provider/)
  })

  it('accepts a configured OpenAI-compatible endpoint without requiring a key', async () => {
    await expect(
      validateModelCredentials(
        { provider: 'openai-compatible', modelName: 'local-model' },
        settings({ openaiCompatibleBaseUrl: 'http://localhost:8000/v1' })
      )
    ).resolves.toBeUndefined()
  })
})

describe('pickActiveModel', () => {
  it('returns the last composer pick when present', () => {
    const model = { provider: 'openai-compatible' as const, modelName: 'gpt-4.1-mini' }
    expect(pickActiveModel(settings({ lastModel: model }))).toEqual(model)
  })

  it('returns null when the user has never picked a model', () => {
    expect(pickActiveModel(settings())).toBeNull()
    expect(pickActiveModel(settings({ lastModel: null }))).toBeNull()
  })
})
