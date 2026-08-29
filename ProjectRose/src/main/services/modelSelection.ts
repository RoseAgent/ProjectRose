import type { AppSettings, ModelConfig } from './settingsService'

/**
 * Validate that the selected model has the configuration it needs. Ollama is
 * keyless. OpenAI-compatible endpoints may also be keyless, so only their URL
 * and model name are required here; any stored key is loaded at resolution.
 */
export async function validateModelCredentials(
  model: ModelConfig,
  settings: AppSettings
): Promise<void> {
  if (model.provider === 'ollama') return
  if (model.provider !== 'openai-compatible') {
    throw new Error(`Unsupported model provider: ${String(model.provider)}`)
  }
  if (!settings.openaiCompatibleBaseUrl.trim()) {
    throw new Error('Add an OpenAI-compatible base URL in Settings → Providers.')
  }
  if (!model.modelName.trim()) {
    throw new Error('Add an OpenAI-compatible model name in Settings → Providers.')
  }
}

/** Unwrap a human-readable provider error from common SDK error shapes. */
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

/** The fallback model for background work without an active Conversation. */
export function pickActiveModel(settings: AppSettings): ModelConfig | null {
  return settings.lastModel ?? null
}
