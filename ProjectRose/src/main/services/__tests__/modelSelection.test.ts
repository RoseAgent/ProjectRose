import { describe, it, expect, vi, beforeEach } from 'vitest'

const sessionState: { token: string | null } = { token: null }
const kimiState: { tokens: object | null; apiKey: boolean } = { tokens: null, apiKey: false }
const bedrockState: { credentials: boolean } = { credentials: false }

vi.mock('../../lib/session', () => ({
  loadSession: vi.fn(async () => (sessionState.token ? { token: sessionState.token } : null))
}))
vi.mock('../../lib/kimiSession', () => ({
  loadKimiTokens: vi.fn(async () => kimiState.tokens),
  hasKimiApiKey: vi.fn(async () => kimiState.apiKey)
}))
vi.mock('../../lib/bedrockCredentials', () => ({
  hasBedrockCredentials: vi.fn(async () => bedrockState.credentials)
}))

import { validateModelCredentials, pickActiveModel } from '../modelSelection'
import type { AppSettings } from '../settingsService'

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return { kimiAuthMethod: 'oauth', ...overrides } as AppSettings
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.token = null
  kimiState.tokens = null
  kimiState.apiKey = false
  bedrockState.credentials = false
})

describe('validateModelCredentials', () => {
  it('passes for projectrose when a session token is stored', async () => {
    sessionState.token = 'tok'
    await expect(
      validateModelCredentials({ provider: 'projectrose', modelName: 'managed' }, settings())
    ).resolves.toBeUndefined()
  })

  it('throws for projectrose without a session token', async () => {
    await expect(
      validateModelCredentials({ provider: 'projectrose', modelName: 'managed' }, settings())
    ).rejects.toThrow(/Sign in to your ProjectRose account/)
  })

  it('kimi oauth requires stored tokens', async () => {
    await expect(
      validateModelCredentials({ provider: 'kimi', modelName: 'kimi-for-coding' }, settings())
    ).rejects.toThrow(/Sign in to your Kimi account/)
    kimiState.tokens = { access: 'a' }
    await expect(
      validateModelCredentials({ provider: 'kimi', modelName: 'kimi-for-coding' }, settings())
    ).resolves.toBeUndefined()
  })

  it('kimi apikey requires a stored Moonshot key', async () => {
    await expect(
      validateModelCredentials(
        { provider: 'kimi', modelName: 'kimi-k2-thinking' },
        settings({ kimiAuthMethod: 'apikey' })
      )
    ).rejects.toThrow(/Moonshot API key/)
    kimiState.apiKey = true
    await expect(
      validateModelCredentials(
        { provider: 'kimi', modelName: 'kimi-k2-thinking' },
        settings({ kimiAuthMethod: 'apikey' })
      )
    ).resolves.toBeUndefined()
  })

  it('bedrock requires a stored AWS key pair', async () => {
    const model = { provider: 'bedrock' as const, modelName: 'anthropic.claude-sonnet-4-5-20250929-v1:0' }
    await expect(validateModelCredentials(model, settings())).rejects.toThrow(/AWS credentials/)
    bedrockState.credentials = true
    await expect(validateModelCredentials(model, settings())).resolves.toBeUndefined()
  })

  it('ollama needs no credentials', async () => {
    await expect(
      validateModelCredentials({ provider: 'ollama', modelName: 'llama3' }, settings())
    ).resolves.toBeUndefined()
  })
})

describe('pickActiveModel', () => {
  it('returns the last composer pick when present', () => {
    const model = { provider: 'kimi' as const, modelName: 'k3' }
    expect(pickActiveModel(settings({ lastModel: model }))).toEqual(model)
  })

  it('returns null when the user has never picked a model', () => {
    expect(pickActiveModel(settings())).toBeNull()
    expect(pickActiveModel(settings({ lastModel: null }))).toBeNull()
  })
})
