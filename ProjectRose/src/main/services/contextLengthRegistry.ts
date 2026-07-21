// Per-model context-length lookup. Cloud providers come from a hardcoded
// table; Ollama is queried at runtime via /api/show and cached for the
// process lifetime. Falls back to a conservative 8192 if detection fails.

const FALLBACK_CONTEXT = 8192

const CLOUD_TABLE: Array<{ test: (model: string) => boolean; ctx: number }> = [
  // Bedrock ids carry a vendor prefix ('anthropic.claude-…') and, for
  // cross-region inference profiles, a geo prefix on top of that
  // ('us.anthropic.claude-…'). The unanchored /claude-/ row below already
  // covers every Anthropic-on-Bedrock id at the right 200K window, which is
  // why there's no separate anthropic.* row here — the non-Anthropic Bedrock
  // vendors are what needs explicit rows, and they must come first so the
  // anchored ^gpt-4 / ^o1 rows below never see a prefixed id.
  { test: (m) => /(^|\.)amazon\.nova-premier/.test(m), ctx: 1_000_000 },
  { test: (m) => /(^|\.)amazon\.nova-(pro|lite)/.test(m), ctx: 300_000 },
  { test: (m) => /(^|\.)amazon\.nova-micro/.test(m), ctx: 128_000 },
  { test: (m) => /(^|\.)amazon\.titan-/.test(m), ctx: 8_000 },
  { test: (m) => /(^|\.)meta\.llama/.test(m), ctx: 128_000 },
  { test: (m) => /(^|\.)mistral\./.test(m), ctx: 128_000 },
  { test: (m) => /(^|\.)deepseek\./.test(m), ctx: 128_000 },
  { test: (m) => /(^|\.)cohere\.command-r/.test(m), ctx: 128_000 },
  { test: (m) => /(^|\.)openai\.gpt-oss/.test(m), ctx: 128_000 },
  { test: (m) => /claude-/.test(m), ctx: 200_000 },
  { test: (m) => /^gpt-4/.test(m), ctx: 128_000 },
  { test: (m) => /^gpt-3\.5/.test(m), ctx: 16_000 },
  { test: (m) => /^o1/.test(m), ctx: 200_000 },
  // Moonshot platform K3 ('kimi-k3') carries a 1M window. The Coding API's
  // 'k3' alias reports 256K (per its /models endpoint), same as every other
  // Kimi model (kimi-for-coding, kimi-k2.*). Match the platform id first.
  { test: (m) => /^kimi-k3/.test(m), ctx: 1_048_576 },
  { test: (m) => /^k3/.test(m), ctx: 262_144 },
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
