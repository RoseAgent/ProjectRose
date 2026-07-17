import { BrowserWindow, shell } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  KIMI_CLIENT_ID,
  KIMI_OAUTH_HOST,
  clearKimiTokens,
  loadKimiTokens,
  saveKimiTokens,
  type KimiTokens
} from '../lib/kimiSession'

// OAuth 2.0 Device Authorization Grant (RFC 8628) against auth.kimi.com —
// the same flow and public client id kimi-cli uses, so no app registration
// or client secret is needed. We open the verification URL in the browser
// (with the user code pre-filled), then poll the token endpoint until the
// user approves on kimi.com.

const SIGN_IN_TIMEOUT_MS = 15 * 60 * 1000

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

function emitChanged(loggedIn: boolean): void {
  notifyRenderer(IPC.KIMI_AUTH_CHANGED, { loggedIn })
}

interface DeviceAuthorization {
  deviceCode: string
  userCode: string
  verificationUrl: string
  expiresIn: number | null
  interval: number
}

async function requestDeviceAuthorization(): Promise<DeviceAuthorization> {
  const res = await fetch(`${KIMI_OAUTH_HOST}/api/oauth/device_authorization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: KIMI_CLIENT_ID })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Kimi device authorization failed (${res.status})${body ? `: ${body}` : ''}`)
  }
  const data = (await res.json()) as {
    user_code: string
    device_code: string
    verification_uri?: string
    verification_uri_complete?: string
    expires_in?: number
    interval?: number
  }
  return {
    deviceCode: String(data.device_code),
    userCode: String(data.user_code),
    verificationUrl: String(data.verification_uri_complete || data.verification_uri || ''),
    expiresIn: data.expires_in ? Number(data.expires_in) : null,
    interval: Math.max(Number(data.interval ?? 5), 1)
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function pollForTokens(auth: DeviceAuthorization, flight: PendingSignIn): Promise<KimiTokens> {
  const deadline = Date.now() + Math.min((auth.expiresIn ?? 900) * 1000, SIGN_IN_TIMEOUT_MS)
  let intervalSec = auth.interval

  while (Date.now() < deadline) {
    await sleep(intervalSec * 1000)
    if (flight.cancelled) throw new Error('Sign-in cancelled')

    const res = await fetch(`${KIMI_OAUTH_HOST}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: KIMI_CLIENT_ID,
        device_code: auth.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      error?: string
      error_description?: string
    }

    if (res.status === 200 && data.access_token && data.refresh_token) {
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 900)
      }
    }

    switch (data.error) {
      case 'authorization_pending':
        break
      case 'slow_down':
        intervalSec += 5
        break
      case 'expired_token':
        throw new Error('The sign-in code expired — try again from Settings.')
      case 'access_denied':
        throw new Error('Sign-in was denied on kimi.com.')
      default:
        throw new Error(data.error_description || data.error || `Kimi sign-in failed (${res.status})`)
    }
  }
  throw new Error('Kimi sign-in timed out — try again from Settings.')
}

export async function kimiSignIn(): Promise<void> {
  if (pending) cancelKimiSignIn()

  const auth = await requestDeviceAuthorization()
  const flight: PendingSignIn = { cancelled: false, cancel: () => {} }
  const cancellation = new Promise<never>((_, reject) => {
    flight.cancel = reject
  })
  pending = flight

  notifyRenderer(IPC.KIMI_AUTH_PENDING, { url: auth.verificationUrl, userCode: auth.userCode })
  shell.openExternal(auth.verificationUrl).catch(() => {
    // openExternal can fail on headless Linux. The renderer's "Copy link"
    // fallback uses the url payload above so the user can paste it manually.
  })

  try {
    const tokens = await Promise.race([pollForTokens(auth, flight), cancellation])
    await saveKimiTokens(tokens)
    console.log('[kimi] signed in via device flow')
    emitChanged(true)
  } finally {
    if (pending === flight) pending = null
  }
}

export function cancelKimiSignIn(): void {
  if (!pending) return
  const flight = pending
  pending = null
  flight.cancelled = true
  flight.cancel(new Error('Sign-in cancelled'))
}

export async function kimiSignOut(): Promise<void> {
  await clearKimiTokens()
  emitChanged(false)
}

export interface KimiAuthStatus {
  loggedIn: boolean
}

export async function getKimiAuthStatus(): Promise<KimiAuthStatus> {
  const tokens = await loadKimiTokens()
  return { loggedIn: !!tokens }
}
