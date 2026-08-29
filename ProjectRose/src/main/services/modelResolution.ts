import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOllama } from 'ai-sdk-ollama'
import { loadOpenAICompatibleApiKey } from '../lib/openaiCompatibleCredentials'
import { readSettings } from './settingsService'
import type { ModelConfig } from './settingsService'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveModel(
  model: ModelConfig,
  ollamaBaseUrl: string
): Promise<any> {
  if (model.provider === 'ollama') {
    // Work around ai-sdk-ollama omitting tool_call_id on role:"tool"
    // messages. Without the id, models cannot reliably associate a result
    // with its preceding tool call.
    const patchedFetch: typeof fetch = async (input, init) => {
      if (init?.body && typeof init.body === 'string') {
        try {
          const body = JSON.parse(init.body)
          if (Array.isArray(body.messages)) {
            const pending: Array<{ id: string; name: string }> = []
            let mutated = false
            for (const msg of body.messages) {
              if (msg && msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
                for (const tc of msg.tool_calls) {
                  const id = tc?.id
                  const name = tc?.function?.name ?? tc?.name
                  if (typeof id === 'string' && typeof name === 'string') {
                    pending.push({ id, name })
                  }
                }
              } else if (msg && msg.role === 'tool' && !msg.tool_call_id) {
                const idx = pending.findIndex((p) => p.name === msg.tool_name)
                if (idx !== -1) {
                  msg.tool_call_id = pending[idx].id
                  pending.splice(idx, 1)
                  mutated = true
                }
              }
            }
            if (mutated) init = { ...init, body: JSON.stringify(body) }
          }
        } catch {
          // Unexpected payload — pass it through untouched.
        }
      }
      return globalThis.fetch(input, init)
    }

    const provider = createOllama({
      baseURL: ollamaBaseUrl || 'http://localhost:11434',
      fetch: patchedFetch
    })
    return provider(model.modelName || 'llama3', { think: true })
  }

  if (model.provider !== 'openai-compatible') {
    throw new Error(`Unsupported model provider: ${String(model.provider)}`)
  }

  const settings = await readSettings()
  const baseURL = settings.openaiCompatibleBaseUrl.trim().replace(/\/+$/, '')
  if (!baseURL) {
    throw new Error('Add an OpenAI-compatible base URL in Settings → Providers.')
  }
  if (!model.modelName.trim()) {
    throw new Error('Add an OpenAI-compatible model name in Settings → Providers.')
  }

  // The key is optional because many local-compatible servers do not require
  // authentication. Omit it entirely so those endpoints receive no synthetic
  // Authorization header.
  const apiKey = await loadOpenAICompatibleApiKey()
  const provider = createOpenAICompatible({
    name: 'openai-compatible',
    baseURL,
    ...(apiKey ? { apiKey } : {})
  })
  return provider.chatModel(model.modelName)
}
