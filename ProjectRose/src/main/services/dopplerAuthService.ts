import { hostname } from 'os'
import { BrowserWindow, shell } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  DOPPLER_API_HOST,
  loadDopplerToken,
  saveDopplerToken,
  clearDopplerToken
} from '../lib/dopplerSession'

// Doppler sign-in via the CLI auth flow — the same device-flow the official
// `doppler login` command uses (endpoints confirmed against DopplerHQ/cli):
//   GET  /v3/auth/cli/generate/2?hostname&version&os&arch
//        → { code, auth_url, polling_code }
//   POST /v3/auth/cli/authorize { code: <polling_code> }
//        → 409 while the user hasn't approved yet; { token, ... } once done
//   POST /v3/auth/cli/revoke { token }
// The user opens auth_url in the browser and confirms the displayed code.

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 2_000

interface PendingSignIn {
  cancel: (err: Error) => void
  cancelled: boolean
}

let pending: PendingSignIn | null = null

function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

async function emitChanged(): Promise<void> {
  notifyRenderer(IPC.DOPPLER_AUTH_CHANGED, await getDopplerAuthStatus())
}

interface AuthCodeResponse {
  code?: string
  auth_url?: string
  polling_code?: string
}

// Doppler validates `version` against its CLI version format — anything that
// doesn't look like a released CLI version is rejected with 400
// "Invalid CLI version", so we identify as a recent CLI release.
const DOPPLER_CLI_VERSION = 'v3.68.0'

async function generateAuthCode(): Promise<{ code: string; authUrl: string; pollingCode: string }> {
  const url = new URL(`${DOPPLER_API_HOST}/v3/auth/cli/generate/2`)
  url.searchParams.set('hostname', hostname())
  url.searchParams.set('version', DOPPLER_CLI_VERSION)
  url.searchParams.set('os', process.platform)
  url.searchParams.set('arch', process.arch)
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const data = (await res.json().catch(() => ({}))) as AuthCodeResponse & { messages?: string[] }
  if (!res.ok || !data.auth_url || !data.polling_code) {
    const detail = data.messages?.[0]
    throw new Error(`Doppler auth code request failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  return { code: data.code ?? '', authUrl: data.auth_url, pollingCode: data.polling_code }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function pollForToken(pollingCode: string, flight: PendingSignIn): Promise<string> {
  const deadline = Date.now() + SIGN_IN_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    if (flight.cancelled) throw new Error('Sign-in cancelled')

    const res = await fetch(`${DOPPLER_API_HOST}/v3/auth/cli/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code: pollingCode })
    })
    // 409 = the user hasn't approved in the dashboard yet.
    if (res.status === 409) continue
    const data = (await res.json().catch(() => ({}))) as { token?: string; messages?: string[] }
    if (res.ok && data.token) return data.token
    throw new Error(data.messages?.[0] || `Doppler sign-in failed (${res.status})`)
  }
  throw new Error('Doppler sign-in timed out — try again from Settings.')
}

export async function dopplerSignIn(): Promise<void> {
  if (pending) cancelDopplerSignIn()

  const auth = await generateAuthCode()
  const flight: PendingSignIn = { cancelled: false, cancel: () => {} }
  const cancellation = new Promise<never>((_, reject) => {
    flight.cancel = reject
  })
  pending = flight

  notifyRenderer(IPC.DOPPLER_AUTH_PENDING, { url: auth.authUrl, userCode: auth.code })
  shell.openExternal(auth.authUrl).catch(() => {
    // openExternal can fail on headless Linux; the renderer shows a copy-link
    // fallback from the pending payload.
  })

  try {
    const token = await Promise.race([pollForToken(auth.pollingCode, flight), cancellation])
    await saveDopplerToken(token)
    console.log('[doppler] signed in via CLI auth flow')
    await emitChanged()
  } finally {
    if (pending === flight) pending = null
  }
}

export function cancelDopplerSignIn(): void {
  if (!pending) return
  const flight = pending
  pending = null
  flight.cancelled = true
  flight.cancel(new Error('Sign-in cancelled'))
}

export async function dopplerSignOut(): Promise<void> {
  const token = await loadDopplerToken()
  if (token) {
    // Best-effort revoke — the local copy is deleted regardless.
    await fetch(`${DOPPLER_API_HOST}/v3/auth/cli/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    }).catch(() => {})
  }
  await clearDopplerToken()
  await emitChanged()
}

export interface DopplerAuthStatus {
  loggedIn: boolean
}

export async function getDopplerAuthStatus(): Promise<DopplerAuthStatus> {
  return { loggedIn: (await loadDopplerToken()) !== null }
}

// ── Project / config enumeration (signed-in path) ────────────────────────
// A CLI-flow token is workplace-scoped, so the import UI needs the user to
// pick which project + config to pull from.

async function authedGet(path: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${DOPPLER_API_HOST}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { messages?: string[] }
  if (!res.ok) {
    throw new Error(data.messages?.[0] || `Doppler request failed (${res.status})`)
  }
  return data
}

export async function dopplerListProjects(): Promise<string[]> {
  const token = await loadDopplerToken()
  if (!token) throw new Error('Not signed in to Doppler.')
  const data = await authedGet('/v3/projects?per_page=100', token)
  const projects = Array.isArray(data.projects) ? (data.projects as Array<Record<string, unknown>>) : []
  return projects
    .map((p) => String(p.slug ?? p.id ?? p.name ?? ''))
    .filter(Boolean)
}

export async function dopplerListConfigs(project: string): Promise<string[]> {
  const token = await loadDopplerToken()
  if (!token) throw new Error('Not signed in to Doppler.')
  const data = await authedGet(`/v3/configs?project=${encodeURIComponent(project)}&per_page=100`, token)
  const configs = Array.isArray(data.configs) ? (data.configs as Array<Record<string, unknown>>) : []
  return configs.map((c) => String(c.name ?? '')).filter(Boolean)
}
