import { describe, it, expect } from 'vitest'
import { getContextLength } from '../contextLengthRegistry'

// The cloud path is a pure regex table. Ollama is excluded here — it probes
// /api/show over the network and caches for the process lifetime.

describe('getContextLength — Bedrock ids', () => {
  it('resolves Anthropic-on-Bedrock ids through the shared /claude-/ row', async () => {
    // Vendor-prefixed base id and geo-prefixed inference profile id both land
    // on 200K, which is why there's no separate anthropic.* row.
    await expect(
      getContextLength('bedrock', 'anthropic.claude-sonnet-4-5-20250929-v1:0')
    ).resolves.toBe(200_000)
    await expect(
      getContextLength('bedrock', 'us.anthropic.claude-sonnet-4-5-20250929-v1:0')
    ).resolves.toBe(200_000)
  })

  it('matches non-Anthropic Bedrock vendors, bare and geo-prefixed', async () => {
    await expect(getContextLength('bedrock', 'amazon.nova-pro-v1:0')).resolves.toBe(300_000)
    await expect(getContextLength('bedrock', 'eu.amazon.nova-lite-v1:0')).resolves.toBe(300_000)
    await expect(getContextLength('bedrock', 'amazon.nova-premier-v1:0')).resolves.toBe(1_000_000)
    await expect(getContextLength('bedrock', 'amazon.nova-micro-v1:0')).resolves.toBe(128_000)
    await expect(getContextLength('bedrock', 'meta.llama3-3-70b-instruct-v1:0')).resolves.toBe(128_000)
    await expect(getContextLength('bedrock', 'mistral.mistral-large-2407-v1:0')).resolves.toBe(128_000)
    await expect(getContextLength('bedrock', 'deepseek.r1-v1:0')).resolves.toBe(128_000)
    await expect(getContextLength('bedrock', 'cohere.command-r-plus-v1:0')).resolves.toBe(128_000)
  })

  it('puts nova-premier ahead of the generic nova rows', async () => {
    // Ordering matters: /amazon\.nova-(pro|lite)/ would not match premier, but
    // a looser generic row placed first would have swallowed it at 300K.
    expect(await getContextLength('bedrock', 'amazon.nova-premier-v1:0')).toBeGreaterThan(
      await getContextLength('bedrock', 'amazon.nova-pro-v1:0')
    )
  })

  it('routes vendor-prefixed OpenAI ids past the anchored ^gpt-4 row', async () => {
    // ^gpt-4 is anchored, so 'openai.gpt-oss-120b-1:0' would otherwise fall
    // through to the 8192 fallback rather than matching a GPT row.
    await expect(getContextLength('bedrock', 'openai.gpt-oss-120b-1:0')).resolves.toBe(128_000)
  })

  it('falls back to a conservative window for an unrecognised id', async () => {
    await expect(getContextLength('bedrock', 'somevendor.unknown-model-v1:0')).resolves.toBe(8192)
  })
})

describe('getContextLength — existing providers still resolve', () => {
  it('keeps the Kimi rows ordered platform-first', async () => {
    await expect(getContextLength('kimi', 'kimi-k3')).resolves.toBe(1_048_576)
    await expect(getContextLength('kimi', 'k3')).resolves.toBe(262_144)
    await expect(getContextLength('kimi', 'kimi-for-coding')).resolves.toBe(262_144)
  })
})
