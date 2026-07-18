import { loadSession } from '../lib/session'
import { loadKimiTokens, hasKimiApiKey } from '../lib/kimiSession'
import type { AppSettings, ModelConfig } from './settingsService'

/**
 * Check that the credentials the given model needs are actually present,
 * throwing an actionable error if not. The model itself is chosen by the user
 * in the chat composer (per Conversation) — this only validates it's usable.
 */
export async function validateModelCredentials(
  model: ModelConfig,
  settings: AppSettings
): Promise<void> {
  if (model.provider === 'projectrose') {
    const session = await loadSession()
    if (!session?.token) {
      throw new Error('Sign in to your ProjectRose account to use the managed AI endpoint.')
    }
    return
  }

  if (model.provider === 'kimi') {
    if (settings.kimiAuthMethod === 'apikey') {
      if (!(await hasKimiApiKey())) {
        throw new Error('Add your Moonshot API key in Settings → Providers → Kimi.')
      }
    } else {
      const tokens = await loadKimiTokens()
      if (!tokens) {
        throw new Error('Sign in to your Kimi account in Settings → Providers → Kimi.')
      }
    }
  }
  // ollama needs no credentials.
}

/**
 * Unwrap an error message from any of the shapes a provider SDK might raise.
 *
 * Provider responses sometimes serialise their error JSON into Error.message
 * (`{ error: { message: '...' } }`); this helper extracts the human-readable
 * string so callers can surface it without leaking the wrapper structure.
 */
export function extractErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const nested = parsed?.error as Record<string, unknown> | undefined
    const msg = nested?.message ?? parsed?.message ?? raw
    return String(msg)
  } catch {
    return raw
  }
}

/**
 * The fallback model for work that has no Conversation to read a choice from
 * (background jobs, context-status estimates): the most recent pair the user
 * picked in the chat composer. Null until they've ever picked one.
 */
export function pickActiveModel(settings: AppSettings): ModelConfig | null {
  return settings.lastModel ?? null
}
