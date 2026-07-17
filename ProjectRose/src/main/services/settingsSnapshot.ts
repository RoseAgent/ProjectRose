// Builds the snapshot the `read_settings_snapshot` agent tool returns.
//
// Two halves:
//   - configuration: pure read of ~/.rose/settings.json + per-workspace
//     project-settings.json, with the one sensitive field (googleAuth.clientId)
//     stripped out. Everything else in settings.json is either a benign toggle
//     or a user-facing identifier (host, username, signed-in email) — credentials
//     proper live in userData/*.bin and never appear here at all.
//   - connections: live test results, one per provider, run in parallel under
//     a hard timeout. Each entry is { status, detail? } where status is 'ok',
//     'not-configured', or 'failed: <reason>'. The agent never sees the
//     underlying credential — only whether the connection works.

import { readSettings } from './settingsService'
import { readProjectSettings } from './projectSettingsService'
import { getAuthStatus, fetchUsage } from './authService'
import { getKimiAccessToken, loadKimiTokens } from '../lib/kimiSession'
import { buildAuthedClient, googleAuthGetStatus } from './google/googleAuth'
import { googleCalendarGetStatus } from './memory/googleCalendar'
import { hasImapPasswords } from './email/imapCredentialsStore'
import { verifyImapConnection, verifySmtpConnection } from './email/imapTransport'
import type {
  ConnectionResult,
  GoogleAuthConnection,
  OllamaConnection,
  ProjectRoseConnection,
  SettingsSnapshot
} from '../../shared/settingsSnapshot'

const CONNECTION_TIMEOUT_MS = 5_000

function shortError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const oneLine = raw.replace(/\s+/g, ' ').trim()
  return oneLine.length > 200 ? oneLine.slice(0, 200) + '…' : oneLine
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function checkProjectRose(hostMode: string): Promise<ProjectRoseConnection> {
  if (hostMode !== 'projectrose') return { status: 'not-configured' }
  const auth = await getAuthStatus().catch(() => null)
  if (!auth?.loggedIn) return { status: 'not-configured' }
  try {
    const usage = await withTimeout(fetchUsage(), CONNECTION_TIMEOUT_MS)
    if (usage.ok) {
      return { status: 'ok', loggedInEmail: auth.email, detail: `plan: ${usage.usage.plan}` }
    }
    return { status: `failed: ${usage.error}`, loggedInEmail: auth.email }
  } catch (err) {
    return { status: `failed: ${shortError(err)}`, loggedInEmail: auth.email }
  }
}

async function checkOllama(hostMode: string, baseUrl: string): Promise<OllamaConnection> {
  if (hostMode !== 'self') return { status: 'not-configured' }
  const trimmed = baseUrl.trim()
  if (!trimmed) return { status: 'not-configured', detail: 'ollamaBaseUrl is empty' }
  const url = trimmed.replace(/\/+$/, '') + '/api/tags'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return { status: `failed: HTTP ${res.status}` }
    const body = (await res.json().catch(() => null)) as { models?: unknown[] } | null
    const count = Array.isArray(body?.models) ? body.models.length : 0
    return { status: 'ok', modelsReachable: count, detail: `reachable, ${count} model(s)` }
  } catch (err) {
    return { status: `failed: ${shortError(err)}` }
  } finally {
    clearTimeout(timer)
  }
}

async function checkKimi(hostMode: string): Promise<ConnectionResult> {
  if (hostMode !== 'kimi') return { status: 'not-configured' }
  const tokens = await loadKimiTokens().catch(() => null)
  if (!tokens) return { status: 'not-configured', detail: 'not signed in' }
  try {
    const token = await withTimeout(getKimiAccessToken(), CONNECTION_TIMEOUT_MS)
    if (!token) return { status: 'failed: token refresh failed — sign in again' }
    return { status: 'ok', detail: 'signed in, token valid' }
  } catch (err) {
    return { status: `failed: ${shortError(err)}` }
  }
}

async function checkGoogleAuth(): Promise<GoogleAuthConnection> {
  const status = await googleAuthGetStatus().catch(() => null)
  if (!status?.credentialsConfigured) return { status: 'not-configured' }
  if (!status.signedIn) return { status: 'not-configured', detail: 'credentials saved but not signed in' }
  try {
    const client = await withTimeout(buildAuthedClient(), CONNECTION_TIMEOUT_MS)
    if (!client) return { status: 'failed: token refresh returned no client', signedInEmail: status.accountEmail ?? undefined }
    return { status: 'ok', signedInEmail: status.accountEmail ?? undefined }
  } catch (err) {
    return { status: `failed: ${shortError(err)}`, signedInEmail: status.accountEmail ?? undefined }
  }
}

async function checkGoogleCalendar(): Promise<ConnectionResult> {
  const auth = await googleAuthGetStatus().catch(() => null)
  if (!auth?.signedIn) return { status: 'not-configured' }
  try {
    const status = await withTimeout(googleCalendarGetStatus(), CONNECTION_TIMEOUT_MS)
    if (status.scopeGranted) {
      return { status: 'ok', detail: `${status.calendars.length} calendar(s) visible` }
    }
    return { status: 'failed: scope not granted — user may need to re-sign-in to consent to Calendar' }
  } catch (err) {
    return { status: `failed: ${shortError(err)}` }
  }
}

async function checkImap(transport: 'imap' | 'google' | null): Promise<ConnectionResult> {
  if (transport !== 'imap') return { status: 'not-configured' }
  if (!(await hasImapPasswords().catch(() => false))) {
    return { status: 'not-configured', detail: 'IMAP password not stored' }
  }
  try {
    await withTimeout(verifyImapConnection(), CONNECTION_TIMEOUT_MS)
    return { status: 'ok' }
  } catch (err) {
    return { status: `failed: ${shortError(err)}` }
  }
}

async function checkSmtp(transport: 'imap' | 'google' | null): Promise<ConnectionResult> {
  if (transport !== 'imap') return { status: 'not-configured' }
  if (!(await hasImapPasswords().catch(() => false))) {
    return { status: 'not-configured', detail: 'SMTP password not stored' }
  }
  try {
    await withTimeout(verifySmtpConnection(), CONNECTION_TIMEOUT_MS)
    return { status: 'ok' }
  } catch (err) {
    return { status: `failed: ${shortError(err)}` }
  }
}

export async function buildSettingsSnapshot(rootPath: string): Promise<SettingsSnapshot> {
  const settings = await readSettings(rootPath)
  const project = await readProjectSettings(rootPath).catch(() => ({
    disabledTools: [],
    disabledPrompts: [],
    seededDefaultDisabledTools: []
  }))

  // googleAuth.clientId is the only field in settings.json that's a secret —
  // strip it on the way out; surface only presence.
  const google = settings.googleAuth
  const googleConfig = {
    credentialsConfigured: !!google?.clientId,
    credentialsBundled: !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    signedInEmail: google?.signedInEmail ?? null
  }

  const configuration: SettingsSnapshot['configuration'] = {
    identity: {
      userName: settings.userName,
      agentName: settings.agentName,
      lastMainView: settings.lastMainView,
      agentStartsExpanded: settings.agentStartsExpanded
    },
    speech: {
      micDeviceId: settings.micDeviceId,
      whisperModel: settings.whisperModel,
      activeListeningSetupComplete: settings.activeListeningSetupComplete,
      activeListeningDraftSeconds: settings.activeListeningDraftSeconds
    },
    tts: {
      enabled: settings.tts.enabled,
      voice: settings.tts.voice,
      speed: settings.tts.speed,
      roseSpeechSpeakerId: settings.roseSpeechSpeakerId
    },
    provider: {
      hostMode: settings.hostMode,
      ollamaBaseUrl: settings.ollamaBaseUrl,
      ollamaModelName: settings.ollamaModelName,
      kimiModelName: settings.kimiModelName
    },
    google: googleConfig,
    memory: {
      diary: {
        enabled: settings.memory.diaryEnabled,
        time: settings.memory.diaryTime,
        lastRunAt: settings.memory.diaryLastRun
      },
      contactsUpdater: {
        enabled: settings.memory.contactsUpdaterEnabled,
        lastRunAt: settings.memory.contactsUpdaterLastRun
      },
      googleContactsSync: {
        accountEmail: settings.memory.googleSync.accountEmail,
        lastPullAt: settings.memory.googleSync.lastPullAt,
        lastPushAt: settings.memory.googleSync.lastPushAt,
        syncKinds: { ...settings.memory.googleSync.syncKinds }
      },
      googleCalendarSync: settings.memory.googleCalendarSync
        ? {
            lastPullAt: settings.memory.googleCalendarSync.lastPullAt,
            lastPushAt: settings.memory.googleCalendarSync.lastPushAt,
            syncCalendars: { ...settings.memory.googleCalendarSync.syncCalendars }
          }
        : null
    },
    email: {
      transport: settings.email.transport,
      accountAddress: settings.email.account.address,
      accountDisplayName: settings.email.account.displayName,
      imap: settings.email.imap
        ? {
            host: settings.email.imap.host,
            port: settings.email.imap.port,
            secure: settings.email.imap.secure,
            username: settings.email.imap.username
          }
        : null,
      smtp: settings.email.smtp
        ? {
            host: settings.email.smtp.host,
            port: settings.email.smtp.port,
            secure: settings.email.smtp.secure,
            username: settings.email.smtp.username
          }
        : null,
      lastSyncAt: settings.email.lastSyncAt
    },
    workspace: {
      disabledTools: [...project.disabledTools],
      disabledPrompts: [...project.disabledPrompts]
    }
  }

  // Promise.allSettled so one slow / wedged provider doesn't stall the rest.
  // Each individual check already swallows its own errors and returns a
  // ConnectionResult, but allSettled is the belt to the suspenders in case a
  // checker throws unexpectedly.
  const [projectRose, ollama, kimi, googleAuth, googleCalendar, imap, smtp] = await Promise.all([
    checkProjectRose(settings.hostMode).catch((err) => ({ status: `failed: ${shortError(err)}` } as ProjectRoseConnection)),
    checkOllama(settings.hostMode, settings.ollamaBaseUrl).catch((err) => ({ status: `failed: ${shortError(err)}` } as OllamaConnection)),
    checkKimi(settings.hostMode).catch((err) => ({ status: `failed: ${shortError(err)}` } as ConnectionResult)),
    checkGoogleAuth().catch((err) => ({ status: `failed: ${shortError(err)}` } as GoogleAuthConnection)),
    checkGoogleCalendar().catch((err) => ({ status: `failed: ${shortError(err)}` } as ConnectionResult)),
    checkImap(settings.email.transport).catch((err) => ({ status: `failed: ${shortError(err)}` } as ConnectionResult)),
    checkSmtp(settings.email.transport).catch((err) => ({ status: `failed: ${shortError(err)}` } as ConnectionResult))
  ])

  return {
    configuration,
    connections: { projectRose, ollama, kimi, googleAuth, googleCalendar, imap, smtp }
  }
}
