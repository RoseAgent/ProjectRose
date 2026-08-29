// Per-model context-length lookup. Ollama is queried at runtime through
// /api/show. OpenAI-compatible endpoints do not expose a standard context
// length field, so common model families use conservative heuristics and
// unknown models fall back to 8192 tokens.

const FALLBACK_CONTEXT = 8192

const COMPATIBLE_MODEL_TABLE: Array<{ test: (model: string) => boolean; ctx: number }> = [
  { test: (model) => /^gpt-4\.1/.test(model), ctx: 1_047_576 },
  { test: (model) => /^gpt-4o/.test(model), ctx: 128_000 },
  { test: (model) => /^gpt-4/.test(model), ctx: 128_000 },
  { test: (model) => /^gpt-3\.5/.test(model), ctx: 16_000 },
  { test: (model) => /^(o1|o3|o4)/.test(model), ctx: 200_000 },
  { test: (model) => /claude-/.test(model), ctx: 200_000 },
  { test: (model) => /llama.?3/.test(model), ctx: 128_000 }
]

const ollamaCache = new Map<string, number>()

async function detectOllamaContextLength(baseUrl: string, model: string): Promise<number> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/show`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: model })
  })
  if (!response.ok) throw new Error(`/api/show ${response.status}`)
  const data = (await response.json()) as { model_info?: Record<string, unknown> }
  for (const [key, value] of Object.entries(data.model_info ?? {})) {
    if (key.endsWith('.context_length') && typeof value === 'number' && value > 0) {
      return value
    }
  }
  throw new Error('no context_length in model_info')
}

export async function getContextLength(
  provider: string,
  model: string,
  baseUrl?: string
): Promise<number> {
  if (provider === 'ollama' && baseUrl) {
    const key = `${baseUrl}::${model}`
    const cached = ollamaCache.get(key)
    if (cached !== undefined) return cached
    try {
      const detected = await detectOllamaContextLength(baseUrl, model)
      ollamaCache.set(key, detected)
      return detected
    } catch {
      ollamaCache.set(key, FALLBACK_CONTEXT)
      return FALLBACK_CONTEXT
    }
  }

  return COMPATIBLE_MODEL_TABLE.find((entry) => entry.test(model))?.ctx ?? FALLBACK_CONTEXT
}
