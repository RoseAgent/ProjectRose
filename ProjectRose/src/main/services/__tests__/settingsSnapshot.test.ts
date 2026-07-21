import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks for every dependency the snapshot module reaches into. Each test
// overrides individual functions via mockImplementation to exercise specific
// branches.

const settingsState: { value: Record<string, unknown> } = { value: {} }

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
vi.mock('../authService', () => ({
  getAuthStatus: vi.fn(async () => ({ loggedIn: false, email: '', name: '', avatar: '' })),
  fetchUsage: vi.fn(async () => ({ ok: false, error: 'Not signed in' }))
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
vi.mock('../email/imapCredentialsStore', () => ({
  hasImapPasswords: vi.fn(async () => false)
}))
vi.mock('../email/imapTransport', () => ({
  verifyImapConnection: vi.fn(async () => { throw new Error('no creds') }),
  verifySmtpConnection: vi.fn(async () => { throw new Error('no creds') }),
  // createImapTransport is part of the module's surface — provide a noop so
  // the import doesn't blow up other callers that pull the same module.
  createImapTransport: vi.fn(() => ({}))
}))

import { buildSettingsSnapshot } from '../settingsSnapshot'
import { readSettings } from '../settingsService'
import { getAuthStatus, fetchUsage } from '../authService'
import { googleAuthGetStatus, buildAuthedClient } from '../google/googleAuth'
import { googleCalendarGetStatus } from '../calendar/googleCalendar'
import { hasImapPasswords } from '../email/imapCredentialsStore'
import { verifyImapConnection, verifySmtpConnection } from '../email/imapTransport'

const SECRET_CLIENT_ID = '123-secret.apps.googleusercontent.com'

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
    kimiAuthMethod: 'oauth',
    bedrockRegion: 'us-east-1',
    lastModel: null,
    roseSpeechSpeakerId: null,
    tts: { enabled: false, voice: 'en_US-amy-medium', speed: 1.0 },
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
    settingsState.value = baseSettings()
  })

  it('returns a configuration block plus a connections block with one entry per provider', async () => {
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.configuration).toBeDefined()
    expect(snap.connections).toBeDefined()
    expect(Object.keys(snap.connections).sort()).toEqual([
      'bedrock',
      'googleAuth',
      'googleCalendar',
      'imap',
      'kimi',
      'ollama',
      'projectRose',
      'search',
      'smtp'
    ])
  })

  it('strips the OAuth clientId — it never appears in the output JSON', async () => {
    settingsState.value = baseSettings({
      googleAuth: { clientId: SECRET_CLIENT_ID, signedInEmail: 'user@example.com' }
    })
    const snap = await buildSettingsSnapshot('/proj')
    const json = JSON.stringify(snap)
    expect(json).not.toContain(SECRET_CLIENT_ID)
    expect(json).not.toContain('clientId')
    expect(snap.configuration.google.credentialsConfigured).toBe(true)
    expect(snap.configuration.google.signedInEmail).toBe('user@example.com')
  })

  it('reports every provider as not-configured on a default settings file', async () => {
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.projectRose.status).toBe('not-configured')
    expect(snap.connections.ollama.status).toBe('not-configured')
    expect(snap.connections.googleAuth.status).toBe('not-configured')
    expect(snap.connections.googleCalendar.status).toBe('not-configured')
    expect(snap.connections.imap.status).toBe('not-configured')
    expect(snap.connections.smtp.status).toBe('not-configured')
    expect(snap.connections.search.status).toBe('not-configured')
  })

  it('marks Ollama ok when /api/tags returns 2xx, and reports the model count', async () => {
    settingsState.value = baseSettings({ ollamaBaseUrl: 'http://localhost:11434/' })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ models: [{}, {}, {}] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.ollama.status).toBe('ok')
    expect(snap.connections.ollama.modelsReachable).toBe(3)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    vi.unstubAllGlobals()
  })

  it('marks Ollama failed when the fetch throws', async () => {
    settingsState.value = baseSettings({ ollamaBaseUrl: 'http://localhost:11434' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.ollama.status).toMatch(/^failed: /)
    expect(snap.connections.ollama.status).toContain('ECONNREFUSED')
    vi.unstubAllGlobals()
  })

  it('marks projectRose ok when usage check succeeds', async () => {
    vi.mocked(getAuthStatus).mockResolvedValueOnce({
      loggedIn: true, email: 'u@e.com', name: 'U', avatar: ''
    })
    vi.mocked(fetchUsage).mockResolvedValueOnce({
      ok: true,
      usage: { plan: 'pro', plan_budget_usd: 20, month_cost_usd: 0, month_remaining_usd: 20, pct: 0, over_budget: false }
    })
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.projectRose.status).toBe('ok')
    expect(snap.connections.projectRose.loggedInEmail).toBe('u@e.com')
  })

  it('marks projectRose failed when the usage check rejects the token', async () => {
    vi.mocked(getAuthStatus).mockResolvedValueOnce({
      loggedIn: true, email: 'u@e.com', name: 'U', avatar: ''
    })
    vi.mocked(fetchUsage).mockResolvedValueOnce({ ok: false, error: 'Usage check failed (401)' })
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.projectRose.status).toBe('failed: Usage check failed (401)')
  })

  it('marks googleAuth ok when a token refresh produces a client', async () => {
    vi.mocked(googleAuthGetStatus).mockResolvedValueOnce({
      credentialsConfigured: true, credentialsBundled: false, signedIn: true, accountEmail: 'g@e.com'
    })
    // buildAuthedClient returns a truthy "client" — we don't care about its
    // shape, just that the call resolves.
    vi.mocked(buildAuthedClient).mockResolvedValueOnce({} as unknown as Awaited<ReturnType<typeof buildAuthedClient>>)
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.googleAuth.status).toBe('ok')
    expect(snap.connections.googleAuth.signedInEmail).toBe('g@e.com')
  })

  it('marks googleAuth failed when the refresh throws (revoked / expired)', async () => {
    vi.mocked(googleAuthGetStatus).mockResolvedValueOnce({
      credentialsConfigured: true, credentialsBundled: false, signedIn: true, accountEmail: 'g@e.com'
    })
    vi.mocked(buildAuthedClient).mockRejectedValueOnce(new Error('invalid_grant'))
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.googleAuth.status).toContain('invalid_grant')
  })

  it('marks googleCalendar failed when scope is not granted', async () => {
    vi.mocked(googleAuthGetStatus).mockResolvedValue({
      credentialsConfigured: true, credentialsBundled: false, signedIn: true, accountEmail: 'g@e.com'
    })
    vi.mocked(googleCalendarGetStatus).mockResolvedValueOnce({
      credentialsConfigured: true,
      signedIn: true,
      scopeGranted: false,
      accountEmail: 'g@e.com',
      calendars: [],
      lastPullAt: null,
      lastPushAt: null
    })
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.googleCalendar.status).toContain('failed:')
    expect(snap.connections.googleCalendar.status).toContain('scope')
  })

  it('marks imap and smtp ok when verify succeeds; carries email config in configuration block', async () => {
    settingsState.value = baseSettings({
      email: {
        transport: 'imap',
        account: { address: 'me@e.com', displayName: 'Me' },
        imap: { host: 'imap.example.com', port: 993, secure: true, username: 'me@e.com' },
        smtp: { host: 'smtp.example.com', port: 587, secure: false, username: 'me@e.com' },
        lastSyncAt: null
      }
    })
    vi.mocked(hasImapPasswords).mockResolvedValue(true)
    vi.mocked(verifyImapConnection).mockResolvedValueOnce(undefined)
    vi.mocked(verifySmtpConnection).mockResolvedValueOnce(undefined)
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.imap.status).toBe('ok')
    expect(snap.connections.smtp.status).toBe('ok')
    expect(snap.configuration.email.imap?.host).toBe('imap.example.com')
    // No password field should ever appear in the email config block.
    const emailJson = JSON.stringify(snap.configuration.email)
    expect(emailJson).not.toContain('password')
    expect(emailJson).not.toContain('Password')
  })

  it('a thrown checker is caught and reported as failed rather than crashing the whole snapshot', async () => {
    settingsState.value = baseSettings({ email: {
      transport: 'imap',
      account: { address: null, displayName: null },
      imap: { host: 'h', port: 993, secure: true, username: 'u' },
      smtp: { host: 'h', port: 587, secure: false, username: 'u' },
      lastSyncAt: null
    } })
    vi.mocked(hasImapPasswords).mockResolvedValue(true)
    vi.mocked(verifyImapConnection).mockRejectedValueOnce(new Error('connect timeout'))
    vi.mocked(verifySmtpConnection).mockRejectedValueOnce(new Error('auth failed'))
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.imap.status).toContain('connect timeout')
    expect(snap.connections.smtp.status).toContain('auth failed')
    // The rest of the snapshot still made it through.
    expect(snap.configuration.identity.userName).toBe('andrew')
  })

  it('probes providers independently — ProjectRose and Ollama can both be ok at once', async () => {
    settingsState.value = baseSettings({ ollamaBaseUrl: 'http://localhost:11434' })
    vi.mocked(getAuthStatus).mockResolvedValueOnce({
      loggedIn: true, email: 'u@e.com', name: 'U', avatar: ''
    })
    vi.mocked(fetchUsage).mockResolvedValueOnce({
      ok: true,
      usage: { plan: 'pro', plan_budget_usd: 20, month_cost_usd: 0, month_remaining_usd: 20, pct: 0, over_budget: false }
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ models: [{}] }), { status: 200 })))
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.projectRose.status).toBe('ok')
    expect(snap.connections.ollama.status).toBe('ok')
    vi.unstubAllGlobals()
  })

  it('carries the composer lastModel and kimi auth method in configuration.provider', async () => {
    settingsState.value = baseSettings({
      lastModel: { provider: 'kimi', modelName: 'kimi-k2-thinking' },
      kimiAuthMethod: 'apikey'
    })
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.configuration.provider.lastModel).toEqual({ provider: 'kimi', modelName: 'kimi-k2-thinking' })
    expect(snap.configuration.provider.kimiAuthMethod).toBe('apikey')
  })

  it('carries the Bedrock region in configuration.provider — but never the AWS keys', async () => {
    settingsState.value = baseSettings({ bedrockRegion: 'eu-central-1' })
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.configuration.provider.bedrockRegion).toBe('eu-central-1')
    // The key pair lives in userData/bedrock-credentials.bin and must never
    // reach the agent-visible snapshot in any form.
    expect(JSON.stringify(snap)).not.toMatch(/accessKeyId|secretAccessKey|AKIA/)
  })

  it('reports bedrock not-configured when no AWS credentials are stored', async () => {
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.connections.bedrock.status).toBe('not-configured')
  })

  it('forwards workspace project-settings into configuration.workspace', async () => {
    const { readProjectSettings } = await import('../projectSettingsService')
    vi.mocked(readProjectSettings).mockResolvedValueOnce({
      disabledTools: ['run_command'],
      disabledPrompts: ['rose-discord'],
      seededDefaultDisabledTools: []
    })
    const snap = await buildSettingsSnapshot('/proj')
    expect(snap.configuration.workspace.disabledTools).toEqual(['run_command'])
    expect(snap.configuration.workspace.disabledPrompts).toEqual(['rose-discord'])
  })
})

// Smoke test: the readSettings stub is wired and the module can read it.
describe('module wiring', () => {
  it('calls readSettings with the workspace rootPath', async () => {
    await buildSettingsSnapshot('/somewhere')
    expect(vi.mocked(readSettings)).toHaveBeenCalledWith('/somewhere')
  })
})
