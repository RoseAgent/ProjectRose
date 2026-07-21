// Agent-global Google OAuth machinery. Owns the refresh-token cache, the
// PKCE/loopback sign-in flow, the shared OAuth2Client builder, and the set
// of scopes ProjectRose requests across all Google integrations.
//
// Per ADR 0009, all Google services share a single user-supplied
// {clientId, clientSecret} pair (stored via googleOAuthCredentialsStore) and
// a single refresh token (this file, encrypted with safeStorage). Adding a
// scope to GOOGLE_SCOPES forces the user to re-consent on next sign-in.

import { createServer, type Server } from 'http'
import { AddressInfo } from 'net'
import { URL } from 'url'
import { app, safeStorage, shell } from 'electron'
import { join } from 'path'
import { readFile, writeFile, unlink } from 'fs/promises'
import { google } from 'googleapis'
import { CodeChallengeMethod, type OAuth2Client } from 'google-auth-library'

import type { GoogleOAuthCredentials } from '../../../shared/googleOAuth'
import {
  readGoogleOAuthCredentials,
  saveGoogleOAuthCredentials,
  clearGoogleOAuthCredentials,
  googleOAuthCredentialsBundled
} from './googleOAuthCredentialsStore'
import { applySettingsPatch, readSettings } from '../settingsService'

// ── Scopes ───────────────────────────────────────────────────────────────
//
// One scope set powers Contacts (People API), Email (Gmail API), and Calendar
// (Google Calendar API). Widening this triggers re-consent for everyone,
// which is the price ADR 0009 accepts for sharing a single OAuth client
// across integrations (and ADR 0012 reaffirms for Calendar).

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar'
]

// ── Token storage ────────────────────────────────────────────────────────

const TOKEN_FILENAME = 'google-session.bin'

function tokenPath(): string {
  return join(app.getPath('userData'), TOKEN_FILENAME)
}

export async function readRefreshToken(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const buf = await readFile(tokenPath())
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

async function writeRefreshToken(token: string): Promise<void> {
  const encrypted = safeStorage.encryptString(token)
  await writeFile(tokenPath(), encrypted)
}

export async function clearRefreshToken(): Promise<void> {
  await unlink(tokenPath()).catch(() => { /* tolerate */ })
}

// ── Signed-in email (canonical location) ─────────────────────────────────
//
// Canonical: settings.googleAuth.signedInEmail.
// Legacy: settings.contacts.googleSync.accountEmail (where Contacts used to
// store it). Read falls back to the legacy field for users who signed in
// before this refactor; write only touches the canonical field, so the
// legacy field is harmless once it has been superseded.

export async function readSignedInEmail(): Promise<string | null> {
  const s = await readSettings()
  if (s.googleAuth?.signedInEmail !== undefined) return s.googleAuth.signedInEmail
  return s.contacts?.googleSync?.accountEmail ?? null
}

async function writeSignedInEmail(email: string | null): Promise<void> {
  const s = await readSettings()
  await applySettingsPatch({
    googleAuth: { ...(s.googleAuth ?? { clientId: '' }), signedInEmail: email }
  })
}

// ── OAuth client ─────────────────────────────────────────────────────────

function newOAuthClient(creds: GoogleOAuthCredentials, redirectUri?: string): OAuth2Client {
  return new google.auth.OAuth2({
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    redirectUri
  })
}

export async function buildAuthedClient(): Promise<OAuth2Client | null> {
  const refreshToken = await readRefreshToken()
  if (!refreshToken) return null
  const creds = await readGoogleOAuthCredentials()
  if (!creds) return null
  const fresh = await refreshAccessToken({ creds, refreshToken })
  const client = newOAuthClient(creds)
  client.setCredentials({
    refresh_token: refreshToken,
    access_token: fresh.access_token,
    expiry_date: fresh.expires_in ? Date.now() + fresh.expires_in * 1000 : undefined
  })
  return client
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  id_token?: string
}

async function refreshAccessToken(args: {
  creds: GoogleOAuthCredentials
  refreshToken: string
}): Promise<TokenResponse> {
  const params = new URLSearchParams({
    refresh_token: args.refreshToken,
    client_id: args.creds.clientId,
    client_secret: args.creds.clientSecret,
    grant_type: 'refresh_token'
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })
  const bodyText = await res.text()
  if (!res.ok) {
    let parsed: { error?: string; error_description?: string } = {}
    try { parsed = JSON.parse(bodyText) } catch { /* not JSON */ }
    const code = parsed.error ?? 'refresh_failed'
    const desc = parsed.error_description ? ` — ${parsed.error_description}` : ''
    throw new Error(`Google token refresh failed: ${res.status} ${code}${desc}`)
  }
  try {
    return JSON.parse(bodyText) as TokenResponse
  } catch {
    throw new Error(`Google token refresh returned non-JSON: ${bodyText.slice(0, 200)}`)
  }
}

async function exchangeCodeForTokens(args: {
  creds: GoogleOAuthCredentials
  redirectUri: string
  code: string
  codeVerifier: string
}): Promise<TokenResponse> {
  const params = new URLSearchParams({
    code: args.code,
    client_id: args.creds.clientId,
    client_secret: args.creds.clientSecret,
    code_verifier: args.codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: args.redirectUri
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  })
  const bodyText = await res.text()
  if (!res.ok) {
    let parsed: { error?: string; error_description?: string; error_uri?: string } = {}
    try { parsed = JSON.parse(bodyText) } catch { /* not JSON */ }
    const code = parsed.error ?? 'token_exchange_failed'
    const desc = parsed.error_description ? ` — ${parsed.error_description}` : ''
    const ref = parsed.error_uri ? ` (see ${parsed.error_uri})` : ''
    throw new Error(`Google token exchange failed: ${res.status} ${code}${desc}${ref}`)
  }
  try {
    return JSON.parse(bodyText) as TokenResponse
  } catch {
    throw new Error(`Google token exchange returned non-JSON: ${bodyText.slice(0, 200)}`)
  }
}

async function startPkceFlow(creds: GoogleOAuthCredentials, redirectUri: string): Promise<{
  client: OAuth2Client
  codeVerifier: string
  codeChallenge: string
}> {
  const client = newOAuthClient(creds, redirectUri)
  const codes = await client.generateCodeVerifierAsync()
  if (!codes.codeVerifier || !codes.codeChallenge) {
    throw new Error('Failed to generate PKCE verifier/challenge.')
  }
  return { client, codeVerifier: codes.codeVerifier, codeChallenge: codes.codeChallenge }
}

// ── Status / sign-in / sign-out / clear ─────────────────────────────────

export interface GoogleAuthStatus {
  credentialsConfigured: boolean
  // True when this build ships its own Google OAuth pair (ADR 0009 amendment
  // 2026-05-24). The renderer hides the BYO credential inputs in this case.
  credentialsBundled: boolean
  signedIn: boolean
  accountEmail: string | null
}

export async function googleAuthGetStatus(): Promise<GoogleAuthStatus> {
  const creds = await readGoogleOAuthCredentials()
  const hasToken = !!(await readRefreshToken())
  const accountEmail = creds && hasToken ? await readSignedInEmail() : null
  return {
    credentialsConfigured: !!creds,
    credentialsBundled: googleOAuthCredentialsBundled(),
    signedIn: !!creds && hasToken,
    accountEmail
  }
}

export async function googleAuthSaveCredentials(
  payload: { clientId: string; clientSecret: string }
): Promise<GoogleAuthStatus> {
  await saveGoogleOAuthCredentials(payload)
  return googleAuthGetStatus()
}

export async function googleAuthClearCredentials(): Promise<GoogleAuthStatus> {
  await clearRefreshToken()
  // clearGoogleOAuthCredentials wipes the entire settings.googleAuth block,
  // which includes signedInEmail — no separate write needed.
  await clearGoogleOAuthCredentials()
  return googleAuthGetStatus()
}

export async function googleAuthSignOut(): Promise<GoogleAuthStatus> {
  await clearRefreshToken()
  await writeSignedInEmail(null)
  return googleAuthGetStatus()
}

/**
 * Loopback OAuth sign-in. Starts a local HTTP server on a free port, opens
 * the consent page in the user's default browser, waits for the redirect,
 * exchanges the code for tokens, persists the refresh token, captures the
 * signed-in account's email via userinfo.get(), and writes that to the
 * canonical settings field. Returns the new status.
 */
export async function googleAuthSignIn(): Promise<GoogleAuthStatus> {
  const creds = await readGoogleOAuthCredentials()
  if (!creds) {
    throw new Error(
      'Google OAuth credentials are not configured. Add a clientId and clientSecret in Settings → Providers → Google.'
    )
  }

  const { port, server } = await startLoopbackServer()
  const redirectUri = `http://127.0.0.1:${port}/callback`
  const flow = await startPkceFlow(creds, redirectUri)

  const authUrl = flow.client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: flow.codeChallenge
  })

  try {
    await shell.openExternal(authUrl)
    const code = await waitForCode(server)
    const tokens = await exchangeCodeForTokens({
      creds,
      redirectUri,
      code,
      codeVerifier: flow.codeVerifier
    })
    if (!tokens.refresh_token) {
      throw new Error(
        'Google did not return a refresh token. Revoke this app at https://myaccount.google.com/permissions and try again.'
      )
    }
    await writeRefreshToken(tokens.refresh_token)

    flow.client.setCredentials({
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined
    })
    const oauth2 = google.oauth2({ version: 'v2', auth: flow.client })
    const me = await oauth2.userinfo.get()
    await writeSignedInEmail(me.data.email ?? null)
  } finally {
    server.close()
  }

  return googleAuthGetStatus()
}

// ── Loopback HTTP server helpers ─────────────────────────────────────────

async function startLoopbackServer(): Promise<{ port: number; server: Server }> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo | null
      if (!addr) {
        server.close()
        reject(new Error('Failed to bind loopback port for Google sign-in.'))
        return
      }
      resolve({ port: addr.port, server })
    })
  })
}

function waitForCode(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Google sign-in timed out (no callback received within 5 minutes).'))
    }, 5 * 60 * 1000)

    server.on('request', (req, res) => {
      try {
        if (!req.url) return
        const url = new URL(req.url, `http://127.0.0.1`)
        if (url.pathname !== '/callback') {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        const error = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        if (error) {
          res.statusCode = 400
          res.end(callbackHtml(`Sign-in failed: ${error}`))
          clearTimeout(timeout)
          reject(new Error(`Google returned ${error}`))
          return
        }
        if (!code) {
          res.statusCode = 400
          res.end(callbackHtml('No authorization code returned.'))
          clearTimeout(timeout)
          reject(new Error('Google did not return an authorization code.'))
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html')
        res.end(callbackHtml('Sign-in complete. You can close this tab and return to ProjectRose.'))
        clearTimeout(timeout)
        resolve(code)
      } catch (err) {
        clearTimeout(timeout)
        reject(err)
      }
    })
  })
}

function callbackHtml(message: string): string {
  return `<!doctype html><html><head><title>ProjectRose · Google Sign-in</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1a1a;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{max-width:480px;padding:32px;text-align:center}h1{font-weight:400;letter-spacing:1px}</style>
</head><body><main><h1>ProjectRose</h1><p>${escapeHtml(message)}</p></main></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
