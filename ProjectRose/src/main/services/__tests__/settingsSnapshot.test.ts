import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const settingsState: { value: Record<string, unknown> } = { value: {} }
let compatibleKey: string | null = null

vi.mock('../settingsService', () => ({
  readSettings: vi.fn(async () => settingsState.value)
}))
vi.mock('../projectSettingsService', () => ({
  readProjectSettings: vi.fn(async () => ({
    disabledTools: [],
    disabledPrompts: [],
    seededDefaultDisabledTools: []
  }))
}))
vi.mock('../../lib/openaiCompatibleCredentials', () => ({
  loadOpenAICompatibleApiKey: vi.fn(async () => compatibleKey)
}))
vi.mock('../google/googleAuth', () => ({
  googleAuthGetStatus: vi.fn(async () => ({
    credentialsConfigured: false,
    credentialsBundled: false,
    signedIn: false,
    accountEmail: null
  })),
  buildAuthedClient: vi.fn(async () => null)
}))
vi.mock('../calendar/googleCalendar', () => ({
  googleCalendarGetStatus: vi.fn(async () => ({
    credentialsConfigured: false,
    signedIn: false,
    scopeGranted: false,
    accountEmail: null,
    calendars: [],
    lastPullAt: null,
    lastPushAt: null
  }))
}))
vi.mock('../email/imapCredentialsStore', () => ({ hasImapPasswords: vi.fn(async () => false) }))
vi.mock('../email/imapTransport', () => ({
  verifyImapConnection: vi.fn(async () => { throw new Error('no creds') }),
  verifySmtpConnection: vi.fn(async () => { throw new Error('no creds') }),
  createImapTransport: vi.fn(() => ({}))
}))
vi.mock('../toolHandlers', () => ({
  testSearchProvider: vi.fn(async () => ({ status: 'not-configured' }))
}))

import { buildSettingsSnapshot } from '../settingsSnapshot'
import { readSettings } from '../settingsService'
import { googleAuthGetStatus, buildAuthedClient } from '../google/googleAuth'
import { hasImapPasswords } from '../email/imapCredentialsStore'
import { verifyImapConnection, verifySmtpConnection } from '../email/imapTransport'

function baseSettings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userName: 'andrew',
    agentName: 'rose',
    micDeviceId: '',
    whisperModel: 'Xenova/whisper-tiny.en',
    activeListeningSetupComplete: false,
    activeListeningDraftSeconds: 8,
    lastMainView: 'bloom',
    ollamaBaseUrl: '',
    openaiCompatibleBaseUrl: '',
    openaiCompatibleModel: '',
    lastModel: null,
    roseSpeechSpeakerId: null,
    tts: { enabled: false, voice: 'en_US-amy-medium', speed: 1 },
    contacts: {
      googleSync: {
        accountEmail: null,
        lastPullAt: null,
        lastPushAt: null,
        syncKinds: { person: true, business: true, website: false, other: false }
      }
    },
    calendar: {
      googleSync: { lastPullAt: null, lastPushAt: null, syncCalendars: { primary: true } }
    },
    email: {
      transport: null,
      account: { address: null, displayName: null },
      imap: null,
      smtp: null,
      lastSyncAt: null
    },
    ...overrides
  }
}

describe('buildSettingsSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    compatibleKey = null
    settingsState.value = baseSettings()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('returns only the standalone inference connections plus other services', async () => {
    const snap = await buildSettingsSnapshot('/proj')
    expect(Object.keys(snap.connections).sort()).toEqual([
      'googleAuth',
      'googleCalendar',
      'imap',
      'ollama',
      'openaiCompatible',
      'search',
      'smtp'
    ])
  })

  it('reports unconfigured inference providers by default', async () => {
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.ollama.status).toBe('not-configured')
    expect(snap.connections.openaiCompatible.status).toBe('not-configured')
  })

  it('checks Ollama through /api/tags', async () => {
    settingsState.value = baseSettings({ ollamaBaseUrl: 'http://localhost:11434/' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ models: [{}, {}] }))))
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.ollama.status).toBe('ok')
    expect(snap.connections.ollama.modelsReachable).toBe(2)
  })

  it('checks the compatible endpoint through /models with its optional key', async () => {
    settingsState.value = baseSettings({
      openaiCompatibleBaseUrl: 'https://api.example.com/v1/',
      openaiCompatibleModel: 'example-model'
    })
    compatibleKey = 'secret-key'
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.openaiCompatible.status).toBe('ok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/models',
      { headers: { authorization: 'Bearer secret-key' } }
    )
  })

  it('never exposes provider credentials in the snapshot', async () => {
    settingsState.value = baseSettings({
      openaiCompatibleBaseUrl: 'https://api.example.com/v1',
      openaiCompatibleModel: 'example-model'
    })
    compatibleKey = 'super-secret'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    const snap = await buildSettingsSnapshot('/proj')
    expect(JSON.stringify(snap)).not.toContain('super-secret')
    expect(snap.configuration.provider).toEqual({
      lastModel: null,
      ollamaBaseUrl: '',
      openaiCompatibleBaseUrl: 'https://api.example.com/v1',
      openaiCompatibleModel: 'example-model'
    })
  })

  it('strips the Google OAuth client id', async () => {
    settingsState.value = baseSettings({
      googleAuth: { clientId: 'secret-client-id', signedInEmail: 'user@example.com' }
    })
    const snap = await buildSettingsSnapshot('/proj')
    expect(JSON.stringify(snap)).not.toContain('secret-client-id')
    expect(snap.configuration.google.signedInEmail).toBe('user@example.com')
  })

  it('reports Google auth success independently', async () => {
    vi.mocked(googleAuthGetStatus).mockResolvedValueOnce({
      credentialsConfigured: true,
      credentialsBundled: false,
      signedIn: true,
      accountEmail: 'g@example.com'
    })
    vi.mocked(buildAuthedClient).mockResolvedValueOnce({} as never)
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.googleAuth.status).toBe('ok')
  })

  it('reports IMAP and SMTP independently', async () => {
    settingsState.value = baseSettings({
      email: {
        transport: 'imap',
        account: { address: 'me@example.com', displayName: 'Me' },
        imap: { host: 'imap.example.com', port: 993, secure: true, username: 'me' },
        smtp: { host: 'smtp.example.com', port: 587, secure: false, username: 'me' },
        lastSyncAt: null
      }
    })
    vi.mocked(hasImapPasswords).mockResolvedValue(true)
    vi.mocked(verifyImapConnection).mockResolvedValueOnce(undefined)
    vi.mocked(verifySmtpConnection).mockResolvedValueOnce(undefined)
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.imap.status).toBe('ok')
    expect(snap.connections.smtp.status).toBe('ok')
  })

  it('forwards workspace project settings', async () => {
    const { readProjectSettings } = await import('../projectSettingsService')
    vi.mocked(readProjectSettings).mockResolvedValueOnce({
      disabledTools: ['run_command'],
      disabledPrompts: ['rose-discord'],
      seededDefaultDisabledTools: []
    })
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.configuration.workspace.disabledTools).toEqual(['run_command'])
  })
})

describe('module wiring', () => {
  it('reads settings for the requested workspace', async () => {
    settingsState.value = baseSettings()
    await buildSettingsSnapshot('/somewhere')
    expect(vi.mocked(readSettings)).toHaveBeenCalledWith('/somewhere')
  })
})
