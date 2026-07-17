// Per-model context-length lookup. Cloud providers come from a hardcoded
// table; Ollama is queried at runtime via /api/show and cached for the
// process lifetime. Falls back to a conservative 8192 if detection fails.

const FALLBACK_CONTEXT = 8192

const CLOUD_TABLE: Array<{ test: (model: string) => boolean; ctx: number }> = [
  { test: (m) => /claude-/.test(m), ctx: 200_000 },
  { test: (m) => /^gpt-4/.test(m), ctx: 128_000 },
  { test: (m) => /^gpt-3\.5/.test(m), ctx: 16_000 },
  { test: (m) => /^o1/.test(m), ctx: 200_000 },
  // Kimi Code models: K3 series carries a 1M window; the kimi-for-coding /
  // kimi-k2.* aliases are 256K.
  { test: (m) => /^k3/.test(m), ctx: 1_048_576 },
  { test: (m) => /^kimi-/.test(m), ctx: 262_144 },
]

const ollamaCache = new Map<string, number>()

function ollamaCacheKey(baseUrl: string, model: string): string {
  return `${baseUrl}::${model}`
}

async function detectOllamaContextLength(baseUrl: string, model: string): Promise<number> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/show`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: model })
  })
  if (!res.ok) throw new Error(`/api/show ${res.status}`)
  const data = await res.json() as { model_info?: Record<string, unknown> }
  const info = data.model_info ?? {}
  for (const key of Object.keys(info)) {
    if (key.endsWith('.context_length')) {
      const v = info[key]
      if (typeof v === 'number' && v > 0) return v
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
    const key = ollamaCacheKey(baseUrl, model)
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
  for (const row of CLOUD_TABLE) {
    if (row.test(model)) return row.ctx
  }
  return FALLBACK_CONTEXT
}
