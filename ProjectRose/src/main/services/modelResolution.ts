import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOllama } from 'ai-sdk-ollama'
import { loadSession } from '../lib/session'
import { getKimiAccessToken, KIMI_API_BASE_URL, KIMI_USER_AGENT } from '../lib/kimiSession'
import { WEB_BASE_URL } from '../lib/webConfig'
import type { ModelConfig } from './settingsService'

// SSE chunk patcher for the projectrose Responses endpoint. Tracks the
// output_index assigned to each item by response.output_item.added events,
// then back-fills the field on response.function_call_arguments.delta events
// (which the backend currently emits without it). Also injects the required
// status: "completed" on response.output_item.done events for function_call
// items. Returns the line unchanged if it isn't a data line we know about.
function patchProjectroseSseLine(
  line: string,
  itemIdToOutputIndex: Map<string, number>
): string {
  const trailing = line.match(/\r?\n$/)?.[0] ?? ''
  const content = trailing ? line.slice(0, -trailing.length) : line
  if (!content.startsWith('data:')) return line

  const jsonText = content.slice('data:'.length).replace(/^ /, '')
  if (jsonText === '' || jsonText === '[DONE]') return line

  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    return line
  }

  if (
    obj.type === 'response.output_item.added' &&
    typeof obj.output_index === 'number'
  ) {
    const item = obj.item as { id?: unknown } | undefined
    if (item && typeof item.id === 'string') {
      itemIdToOutputIndex.set(item.id, obj.output_index)
    }
  }

  let mutated = false
  if (
    obj.type === 'response.function_call_arguments.delta' &&
    obj.output_index === undefined &&
    typeof obj.item_id === 'string'
  ) {
    const idx = itemIdToOutputIndex.get(obj.item_id)
    if (typeof idx === 'number') {
      obj.output_index = idx
      mutated = true
    }
  }

  if (obj.type === 'response.output_item.done') {
    const item = obj.item as { type?: unknown; status?: unknown } | undefined
    if (item && item.type === 'function_call' && item.status === undefined) {
      item.status = 'completed'
      mutated = true
    }
  }

  if (!mutated) return line
  return `data: ${JSON.stringify(obj)}${trailing}`
}

const patchProjectroseResponsesFetch: typeof fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init)
  if (!response.body) return response
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) return response

  const itemIdToOutputIndex = new Map<string, number>()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      let newlineIdx: number
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx + 1)
        buffer = buffer.slice(newlineIdx + 1)
        controller.enqueue(encoder.encode(patchProjectroseSseLine(line, itemIdToOutputIndex)))
      }
    },
    flush(controller) {
      if (buffer.length > 0) {
        controller.enqueue(encoder.encode(patchProjectroseSseLine(buffer, itemIdToOutputIndex)))
        buffer = ''
      }
    }
  })

  return new Response(response.body.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveModel(
  model: ModelConfig,
  ollamaBaseUrl: string
): Promise<any> {
  switch (model.provider) {
    case 'ollama': {
      // Workaround for ai-sdk-ollama 3.8.3: it omits tool_call_id on role:"tool" messages,
      // which breaks the link to the assistant's tool_calls and confuses models like Qwen3.
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
              if (mutated) {
                init = { ...init, body: JSON.stringify(body) }
              }
            }
          } catch {
            // not JSON or unexpected shape — pass through unchanged
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
    case 'kimi': {
      // Kimi Code (OAuth device flow) — OpenAI Chat Completions-compatible.
      // The token is short-lived (~15 min); getKimiAccessToken refreshes it
      // on the way in, so every resolve gets a live credential. The
      // openai-compatible provider (not @ai-sdk/openai) is deliberate: it
      // surfaces Kimi's `reasoning_content` deltas as reasoning parts, so
      // kimi-k2-thinking streams thinking like the other providers do.
      const token = await getKimiAccessToken()
      if (!token) {
        throw new Error('Sign in to your Kimi account in Settings → Providers → Kimi.')
      }
      const provider = createOpenAICompatible({
        name: 'kimi',
        baseURL: KIMI_API_BASE_URL,
        apiKey: token,
        // The Coding API 403s unless the request identifies as a coding agent.
        headers: { 'User-Agent': KIMI_USER_AGENT }
      })
      return provider.chatModel(model.modelName || 'kimi-for-coding')
    }
    case 'projectrose':
    default: {
      const session = await loadSession()
      const token = session?.token ?? ''
      const provider = createOpenAI({
        apiKey: token,
        baseURL: `${WEB_BASE_URL}/api/openai`,
        // Workaround for the managed Responses endpoint: its SSE stream omits
        // two fields that @ai-sdk/openai 3.x strictly validates, so tool calls
        // never reach the SDK's `tool-call` emit path:
        //   1. `output_index` on response.function_call_arguments.delta
        //   2. `status: "completed"` on response.output_item.done items of
        //       type function_call
        // Until the backend is fixed, rewrite each SSE event on the way in
        // and fill the missing fields before the SDK parses the chunk.
        fetch: patchProjectroseResponsesFetch
      })
      // Explicit .responses() — hits /api/openai/responses. The bare provider()
      // call resolves to the same thing in @ai-sdk/openai 3.x but explicit
      // beats implicit, and reasoning streams (response.reasoning_summary_text.delta)
      // only flow through the Responses transport.
      return provider.responses(model.modelName || 'managed')
    }
  }
}
