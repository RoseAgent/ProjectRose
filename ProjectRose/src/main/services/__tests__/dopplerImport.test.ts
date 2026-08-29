import { describe, it, expect, vi, beforeEach } from 'vitest'

const savedSearch: Array<{ provider: string; key: string }> = []
const savedOpenAIKeys: string[] = []
const savedGoogle: Array<{ clientId: string; clientSecret: string }> = []

vi.mock('../search/searchCredentialsStore', () => ({
  saveSearchCredentials: vi.fn(async (provider: string, key: string) => {
    savedSearch.push({ provider, key })
  })
}))
vi.mock('../../lib/openaiCompatibleCredentials', () => ({
  saveOpenAICompatibleApiKey: vi.fn(async (key: string) => savedOpenAIKeys.push(key))
}))
vi.mock('../google/googleOAuthCredentialsStore', () => ({
  saveGoogleOAuthCredentials: vi.fn(async (credentials: { clientId: string; clientSecret: string }) => {
    savedGoogle.push(credentials)
  })
}))

import { dopplerPreview, dopplerApply } from '../dopplerImport'

function stubDoppler(secrets: Record<string, string>, status = 200): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(secrets), { status })))
}

beforeEach(() => {
  vi.clearAllMocks()
  savedSearch.length = 0
  savedOpenAIKeys.length = 0
  savedGoogle.length = 0
})

describe('dopplerPreview', () => {
  it('detects standalone provider keys and masks values', async () => {
    stubDoppler({
      BRAVE_API_KEY: 'BSA-1234567890abcd',
      OPENAI_API_KEY: 'sk-openai-9999xyzw',
      GOOGLE_OAUTH_CLIENT_ID: '123.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-secret-value',
      UNRELATED_DB_URL: 'postgres://x'
    })
    const preview = await dopplerPreview({ token: 'dp.st.test' })
    expect(preview.candidates.map((candidate) => candidate.target).sort()).toEqual([
      'google-oauth',
      'openai-api-key',
      'search-brave'
    ])
    expect(preview.candidates[0].maskedValue).toContain('…')
  })

  it('matches names case-insensitively', async () => {
    stubDoppler({ openai_compatible_api_key: 'secret-123456789' })
    const preview = await dopplerPreview({ token: 'dp.st.test' })
    expect(preview.candidates[0].target).toBe('openai-api-key')
  })

  it('surfaces a clear error for a rejected token', async () => {
    stubDoppler({}, 401)
    await expect(dopplerPreview({ token: 'bad' })).rejects.toThrow(/rejected the token/)
  })
})

describe('dopplerApply', () => {
  it('writes selected credentials into their encrypted stores', async () => {
    stubDoppler({
      BRAVE_API_KEY: 'BSA-1234567890abcd',
      OPENAI_API_KEY: 'sk-openai-9999xyzw',
      GOOGLE_OAUTH_CLIENT_ID: 'id.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-secret-value'
    })
    const result = await dopplerApply(
      { token: 'dp.st.test' },
      ['search-brave', 'openai-api-key', 'google-oauth']
    )
    expect(result.applied).toHaveLength(3)
    expect(savedSearch).toEqual([{ provider: 'brave', key: 'BSA-1234567890abcd' }])
    expect(savedOpenAIKeys).toEqual(['sk-openai-9999xyzw'])
    expect(savedGoogle).toEqual([
      { clientId: 'id.apps.googleusercontent.com', clientSecret: 'GOCSPX-secret-value' }
    ])
  })

  it('rejects selecting more than one search provider', async () => {
    stubDoppler({ BRAVE_API_KEY: 'a-key-1234567', BROWSERBASE_API_KEY: 'b-key-1234567' })
    await expect(
      dopplerApply({ token: 'dp.st.test' }, ['search-brave', 'search-browserbase'])
    ).rejects.toThrow(/one search provider/)
  })
})
