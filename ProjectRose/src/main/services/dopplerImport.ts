// Doppler secrets import.
//
// One-shot flow: the user pastes a Doppler token in Settings, we download the
// config's secrets, detect names we know how to use (search providers, the
// OpenAI-compatible API key, the Google OAuth pair), and write the selected ones
// into the same safeStorage-backed stores the manual Settings fields use.
//
// The Doppler token is transient — it crosses IPC for the preview and apply
// calls and is never written to disk. Secret values never cross to the
// renderer either: the preview carries masked values only, and apply
// re-downloads from Doppler in the main process.

import { saveSearchCredentials } from './search/searchCredentialsStore'
import { saveOpenAICompatibleApiKey } from '../lib/openaiCompatibleCredentials'
import { saveGoogleOAuthCredentials } from './google/googleOAuthCredentialsStore'
import { loadDopplerToken } from '../lib/dopplerSession'

const DOPPLER_DOWNLOAD_URL = 'https://api.doppler.com/v3/configs/config/secrets/download'
const FETCH_TIMEOUT_MS = 15_000

export interface DopplerAccess {
  // Optional pasted token. When omitted, the CLI-flow token stored by the
  // Doppler sign-in (dopplerAuthService.ts) is used instead.
  token?: string
  // Required for personal/CLI tokens; service tokens (dp.st.…) are already
  // scoped to a project + config and may omit both.
  project?: string
  config?: string
}

// One importable credential detected in the Doppler config. `target` is what
// the value would be written into; `secretName` is the Doppler name it came
// from. Search targets are mutually exclusive (one active provider).
export type ImportTarget =
  | 'search-brave'
  | 'search-tavily'
  | 'search-browserbase'
  | 'openai-api-key'
  | 'google-oauth'

const SEARCH_TARGETS: ImportTarget[] = ['search-brave', 'search-tavily', 'search-browserbase']

export interface ImportCandidate {
  target: ImportTarget
  label: string
  secretName: string
  maskedValue: string
}

export interface DopplerPreview {
  candidates: ImportCandidate[]
  totalSecrets: number
}

export interface DopplerApplyResult {
  applied: Array<{ target: ImportTarget; detail: string }>
}

// Recognized Doppler secret names per target, checked case-insensitively and
// in order — the first present name wins.
const BRAVE_NAMES = ['BRAVE_API_KEY', 'BRAVE_SEARCH_API_KEY', 'BRAVE_SEARCH_KEY']
const TAVILY_NAMES = ['TAVILY_API_KEY', 'TAVILY_KEY']
const BROWSERBASE_NAMES = ['BROWSERBASE_API_KEY', 'BROWSER_BASE_API_KEY', 'BROWSERBASE_KEY']
const OPENAI_NAMES = ['OPENAI_API_KEY', 'OPENAI_COMPATIBLE_API_KEY']
const GOOGLE_ID_NAMES = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_CLIENT_ID']
const GOOGLE_SECRET_NAMES = ['GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET']

function mask(value: string): string {
  if (value.length <= 8) return '••••'
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

function findByNames(secrets: Record<string, string>, names: string[]): { name: string; value: string } | null {
  const byUpper = new Map(Object.keys(secrets).map((k) => [k.toUpperCase(), k]))
  for (const candidate of names) {
    const actual = byUpper.get(candidate)
    if (actual && secrets[actual]?.trim()) {
      return { name: actual, value: secrets[actual].trim() }
    }
  }
  return null
}

async function downloadSecrets(access: DopplerAccess): Promise<Record<string, string>> {
  const token = access.token?.trim() || (await loadDopplerToken())
  if (!token) throw new Error('Sign in with Doppler or paste a Doppler token first.')

  const url = new URL(DOPPLER_DOWNLOAD_URL)
  url.searchParams.set('format', 'json')
  if (access.project?.trim()) url.searchParams.set('project', access.project.trim())
  if (access.config?.trim()) url.searchParams.set('config', access.config.trim())

  let res: Response
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    })
  } catch (err) {
    throw new Error(`Could not reach Doppler: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (res.status === 401) throw new Error('Doppler rejected the token (401). Check that it is valid and not expired.')
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // Doppler error payloads carry a messages[] array — surface the first one.
    let detail = ''
    try {
      const parsed = JSON.parse(body) as { messages?: string[] }
      detail = parsed.messages?.[0] ?? ''
    } catch { /* not JSON */ }
    throw new Error(`Doppler request failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }

  const secrets = (await res.json()) as Record<string, unknown>
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(secrets)) {
    if (typeof value === 'string') flat[key] = value
  }
  return flat
}

function detectCandidates(secrets: Record<string, string>): ImportCandidate[] {
  const candidates: ImportCandidate[] = []

  const brave = findByNames(secrets, BRAVE_NAMES)
  if (brave) {
    candidates.push({ target: 'search-brave', label: 'Web search — Brave Search API key', secretName: brave.name, maskedValue: mask(brave.value) })
  }
  const tavily = findByNames(secrets, TAVILY_NAMES)
  if (tavily) {
    candidates.push({ target: 'search-tavily', label: 'Web search — Tavily API key', secretName: tavily.name, maskedValue: mask(tavily.value) })
  }
  const browserbase = findByNames(secrets, BROWSERBASE_NAMES)
  if (browserbase) {
    candidates.push({ target: 'search-browserbase', label: 'Web search — Browserbase API key', secretName: browserbase.name, maskedValue: mask(browserbase.value) })
  }
  const openai = findByNames(secrets, OPENAI_NAMES)
  if (openai) {
    candidates.push({
      target: 'openai-api-key',
      label: 'OpenAI-compatible endpoint — API key',
      secretName: openai.name,
      maskedValue: mask(openai.value)
    })
  }
  // The Google pair is all-or-nothing: importing half a credential would
  // leave the OAuth flow broken with a confusing "not configured" state.
  const googleId = findByNames(secrets, GOOGLE_ID_NAMES)
  const googleSecret = findByNames(secrets, GOOGLE_SECRET_NAMES)
  if (googleId && googleSecret) {
    candidates.push({
      target: 'google-oauth',
      label: 'Google — OAuth client ID + secret',
      secretName: `${googleId.name} + ${googleSecret.name}`,
      maskedValue: mask(googleSecret.value)
    })
  }

  return candidates
}

export async function dopplerPreview(access: DopplerAccess): Promise<DopplerPreview> {
  const secrets = await downloadSecrets(access)
  return { candidates: detectCandidates(secrets), totalSecrets: Object.keys(secrets).length }
}

export async function dopplerApply(access: DopplerAccess, targets: ImportTarget[]): Promise<DopplerApplyResult> {
  if (targets.filter((t) => SEARCH_TARGETS.includes(t)).length > 1) {
    throw new Error('Pick one search provider — only one of Brave, Tavily, and Browserbase can be active.')
  }

  // Re-download rather than caching values across the preview/apply IPC round
  // trip — keeps the main process stateless and the renderer value-free.
  const secrets = await downloadSecrets(access)
  const applied: DopplerApplyResult['applied'] = []

  for (const target of targets) {
    switch (target) {
      case 'search-brave': {
        const found = findByNames(secrets, BRAVE_NAMES)
        if (!found) throw new Error('Brave key no longer present in the Doppler config.')
        await saveSearchCredentials('brave', found.value)
        applied.push({ target, detail: `search_web now uses Brave Search (${found.name})` })
        break
      }
      case 'search-tavily': {
        const found = findByNames(secrets, TAVILY_NAMES)
        if (!found) throw new Error('Tavily key no longer present in the Doppler config.')
        await saveSearchCredentials('tavily', found.value)
        applied.push({ target, detail: `search_web now uses Tavily (${found.name})` })
        break
      }
      case 'search-browserbase': {
        const found = findByNames(secrets, BROWSERBASE_NAMES)
        if (!found) throw new Error('Browserbase key no longer present in the Doppler config.')
        await saveSearchCredentials('browserbase', found.value)
        applied.push({ target, detail: `search_web now uses Browserbase (${found.name})` })
        break
      }
      case 'openai-api-key': {
        const found = findByNames(secrets, OPENAI_NAMES)
        if (!found) throw new Error('OpenAI API key no longer present in the Doppler config.')
        await saveOpenAICompatibleApiKey(found.value)
        applied.push({ target, detail: `OpenAI-compatible API key saved (${found.name})` })
        break
      }
      case 'google-oauth': {
        const id = findByNames(secrets, GOOGLE_ID_NAMES)
        const secret = findByNames(secrets, GOOGLE_SECRET_NAMES)
        if (!id || !secret) throw new Error('Google OAuth pair no longer complete in the Doppler config.')
        await saveGoogleOAuthCredentials({ clientId: id.value, clientSecret: secret.value })
        applied.push({ target, detail: `Google OAuth credentials saved (${id.name})` })
        break
      }
    }
  }

  return { applied }
}
