import { describe, it, expect, vi, beforeEach } from 'vitest'

const savedSearch: Array<{ provider: string; key: string }> = []
const savedKimiKeys: string[] = []
const savedGoogle: Array<{ clientId: string; clientSecret: string }> = []
const settingsPatches: Array<Record<string, unknown>> = []

vi.mock('../search/searchCredentialsStore', () => ({
  saveSearchCredentials: vi.fn(async (provider: string, key: string) => {
    savedSearch.push({ provider, key })
  })
}))
vi.mock('../../lib/kimiSession', () => ({
  saveKimiApiKey: vi.fn(async (key: string) => {
    savedKimiKeys.push(key)
  })
}))
vi.mock('../google/googleOAuthCredentialsStore', () => ({
  saveGoogleOAuthCredentials: vi.fn(async (creds: { clientId: string; clientSecret: string }) => {
    savedGoogle.push(creds)
  })
}))
vi.mock('../settingsService', () => ({
  applySettingsPatch: vi.fn(async (patch: Record<string, unknown>) => {
    settingsPatches.push(patch)
    return patch
  })
}))

import { dopplerPreview, dopplerApply } from '../dopplerImport'

function stubDoppler(secrets: Record<string, string>, status = 200): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(secrets), { status })))
}

beforeEach(() => {
  vi.clearAllMocks()
  savedSearch.length = 0
  savedKimiKeys.length = 0
  savedGoogle.length = 0
  settingsPatches.length = 0
})

describe('dopplerPreview', () => {
  it('detects recognizable keys and masks values', async () => {
    stubDoppler({
      BRAVE_API_KEY: 'BSA-1234567890abcd',
      TAVILY_API_KEY: 'tvly-abcdefgh12345',
      BROWSERBASE_API_KEY: 'bb_live_123456789012',
      MOONSHOT_API_KEY: 'sk-moonshot-9999xyzw',
      GOOGLE_OAUTH_CLIENT_ID: '123.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-secret-value',
      UNRELATED_DB_URL: 'postgres://x'
    })
    const preview = await dopplerPreview({ token: 'dp.st.test' })
    expect(preview.totalSecrets).toBe(7)
    expect(preview.candidates.map((c) => c.target).sort()).toEqual([
      'google-oauth',
      'kimi-apikey',
      'search-brave',
      'search-browserbase',
      'search-tavily'
    ])
    const brave = preview.candidates.find((c) => c.target === 'search-brave')!
    expect(brave.maskedValue).not.toContain('1234567890')
    expect(brave.maskedValue).toContain('…')
  })

  it('skips a half-present Google pair', async () => {
    stubDoppler({ GOOGLE_CLIENT_ID: 'id-only.apps.googleusercontent.com' })
    const preview = await dopplerPreview({ token: 'dp.st.test' })
    expect(preview.candidates).toEqual([])
  })

  it('matches names case-insensitively', async () => {
    stubDoppler({ tavily_api_key: 'tvly-lowercase-name1' })
    const preview = await dopplerPreview({ token: 'dp.st.test' })
    expect(preview.candidates.map((c) => c.target)).toEqual(['search-tavily'])
  })

  it('surfaces a clear error on a rejected token', async () => {
    stubDoppler({}, 401)
    await expect(dopplerPreview({ token: 'dp.st.bad' })).rejects.toThrow(/rejected the token/)
  })
})

describe('dopplerApply', () => {
  it('writes selected credentials into their stores', async () => {
    stubDoppler({
      BRAVE_API_KEY: 'BSA-1234567890abcd',
      MOONSHOT_API_KEY: 'sk-moonshot-9999xyzw',
      GOOGLE_OAUTH_CLIENT_ID: 'id.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-secret-value'
    })
    const result = await dopplerApply({ token: 'dp.st.test' }, ['search-brave', 'kimi-apikey', 'google-oauth'])
    expect(result.applied).toHaveLength(3)
    expect(savedSearch).toEqual([{ provider: 'brave', key: 'BSA-1234567890abcd' }])
    expect(savedKimiKeys).toEqual(['sk-moonshot-9999xyzw'])
    expect(savedGoogle).toEqual([{ clientId: 'id.apps.googleusercontent.com', clientSecret: 'GOCSPX-secret-value' }])
    // Importing a Kimi key flips the auth method so it takes effect.
    expect(settingsPatches).toEqual([{ kimiAuthMethod: 'apikey' }])
  })

  it('rejects selecting more than one search provider', async () => {
    stubDoppler({ BRAVE_API_KEY: 'a-key-1234567', BROWSERBASE_API_KEY: 'b-key-1234567' })
    await expect(dopplerApply({ token: 'dp.st.test' }, ['search-brave', 'search-browserbase'])).rejects.toThrow(/one search provider/)
    expect(savedSearch).toEqual([])
  })

  it('imports a Browserbase key into the search slot', async () => {
    stubDoppler({ BROWSER_BASE_API_KEY: 'bb_live_abcdef123456' })
    const result = await dopplerApply({ token: 'dp.st.test' }, ['search-browserbase'])
    expect(result.applied).toHaveLength(1)
    expect(savedSearch).toEqual([{ provider: 'browserbase', key: 'bb_live_abcdef123456' }])
  })
})
