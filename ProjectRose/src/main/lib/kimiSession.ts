import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, writeFile, unlink } from 'fs/promises'

// Kimi Code OAuth token pair (device-authorization grant against
// https://auth.kimi.com). Access tokens are short-lived (~15 min); the
// refresh token lives ~30 days and rotates on refresh. Stored encrypted in
// userData/kimi-session.bin — same safeStorage pattern as session.ts.

export const KIMI_CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098'
export const KIMI_OAUTH_HOST = 'https://auth.kimi.com'
export const KIMI_API_BASE_URL = 'https://api.kimi.com/coding/v1'
// The Kimi Coding API rejects requests (403) without a coding-agent UA.
export const KIMI_USER_AGENT = 'KimiCLI/1.5'

// Refresh when less than this many seconds of access-token life remain.
const REFRESH_SKEW_SECONDS = 120

export interface KimiTokens {
  accessToken: string
  refreshToken: string
  // Epoch seconds when the access token expires.
  expiresAt: number
}

function kimiSessionPath(): string {
  return join(app.getPath('userData'), 'kimi-session.bin')
}

export async function loadKimiTokens(): Promise<KimiTokens | null> {
  let buf: Buffer
  try {
    buf = await readFile(kimiSessionPath())
  } catch {
    return null
  }

  try {
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : Buffer.from(buf.toString('utf-8'), 'base64').toString('utf-8')
    return JSON.parse(json) as KimiTokens
  } catch {
    return null
  }
}

export async function saveKimiTokens(t: KimiTokens): Promise<void> {
  const json = JSON.stringify(t)
  let buf: Buffer
  if (safeStorage.isEncryptionAvailable()) {
    buf = safeStorage.encryptString(json)
  } else {
    console.warn('[kimi] safeStorage unavailable — writing base64-encoded plaintext fallback')
    buf = Buffer.from(Buffer.from(json, 'utf-8').toString('base64'), 'utf-8')
  }
  await writeFile(kimiSessionPath(), buf)
}

export async function clearKimiTokens(): Promise<void> {
  try {
    await unlink(kimiSessionPath())
  } catch {
    // ENOENT is fine — already gone.
  }
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export async function refreshKimiTokens(refreshToken: string): Promise<KimiTokens> {
  const res = await fetch(`${KIMI_OAUTH_HOST}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: KIMI_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Kimi token refresh failed (${res.status})`)
  }
  return {
    accessToken: data.access_token,
    // Kimi rotates the refresh token; fall back to the old one if omitted.
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 900)
  }
}

// Single-flight guard so concurrent chat + compression calls don't race two
// refreshes (the rotated refresh token would invalidate the loser's copy).
let refreshInFlight: Promise<string | null> | null = null

/**
 * Return a valid Kimi access token, refreshing (and persisting the rotated
 * pair) when the stored one is expired or about to expire. Returns null when
 * the user isn't signed in or the refresh token has been revoked/expired —
 * callers surface that as a "sign in to Kimi" error.
 */
export async function getKimiAccessToken(): Promise<string | null> {
  const tokens = await loadKimiTokens()
  if (!tokens) return null

  const remaining = tokens.expiresAt - Date.now() / 1000
  if (remaining > REFRESH_SKEW_SECONDS) return tokens.accessToken

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const fresh = await refreshKimiTokens(tokens.refreshToken)
        await saveKimiTokens(fresh)
        return fresh.accessToken
      } catch (err) {
        console.warn('[kimi] token refresh failed:', err instanceof Error ? err.message : err)
        // Only a still-valid access token is worth returning; an expired one
        // would just 401 downstream.
        return remaining > 0 ? tokens.accessToken : null
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}
