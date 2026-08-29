import { describe, it, expect, vi, afterEach } from 'vitest'
import { getContextLength } from '../contextLengthRegistry'

describe('getContextLength', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses model-family heuristics for OpenAI-compatible endpoints', async () => {
    await expect(getContextLength('openai-compatible', 'gpt-4o-mini')).resolves.toBe(128_000)
    await expect(getContextLength('openai-compatible', 'o3-mini')).resolves.toBe(200_000)
  })

  it('uses a conservative fallback for unknown compatible models', async () => {
    await expect(getContextLength('openai-compatible', 'custom-model')).resolves.toBe(8192)
  })

  it('detects Ollama context length through /api/show', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ model_info: { 'qwen.context_length': 32768 } }))
      )
    )
    await expect(
      getContextLength('ollama', 'qwen-test', 'http://localhost:11434')
    ).resolves.toBe(32768)
  })

  it('falls back when Ollama context detection fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await expect(
      getContextLength('ollama', 'offline-test', 'http://localhost:11434')
    ).resolves.toBe(8192)
  })
})
