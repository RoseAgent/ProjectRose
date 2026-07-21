import { describe, it, expect, vi, beforeEach } from 'vitest'

// readSettings migration: the global hostMode era → composer-driven lastModel.

const fileState: { content: string | null } = { content: null }

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => {
    if (fileState.content === null) throw new Error('ENOENT')
    return fileState.content
  }),
  writeFile: vi.fn(async () => {}),
  mkdir: vi.fn(async () => {})
}))
vi.mock('../../lib/agentHome', () => ({
  agentSettingsPath: vi.fn(() => '/fake/.rose/settings.json')
}))
vi.mock('../serviceStatus', () => ({ serviceStatus: {} }))
vi.mock('../interactionLog', () => ({ logInteraction: vi.fn() }))

import { readSettings } from '../settingsService'

function stub(settings: Record<string, unknown>): void {
  fileState.content = JSON.stringify(settings)
}

beforeEach(() => {
  fileState.content = null
})

describe('readSettings hostMode → lastModel migration', () => {
  it('synthesizes lastModel from hostMode projectrose', async () => {
    stub({ hostMode: 'projectrose' })
    const s = await readSettings()
    expect(s.lastModel).toEqual({ provider: 'projectrose', modelName: 'managed' })
    expect('hostMode' in s).toBe(false)
  })

  it('synthesizes lastModel from hostMode kimi with the stored model name', async () => {
    stub({ hostMode: 'kimi', kimiModelName: 'k3', kimiAuthMethod: 'oauth' })
    const s = await readSettings()
    expect(s.lastModel).toEqual({ provider: 'kimi', modelName: 'k3' })
    expect('kimiModelName' in s).toBe(false)
  })

  it('kimi default honors the auth method when no model name was stored', async () => {
    stub({ hostMode: 'kimi', kimiModelName: '', kimiAuthMethod: 'apikey' })
    const s = await readSettings()
    expect(s.lastModel).toEqual({ provider: 'kimi', modelName: 'kimi-k3' })

    stub({ hostMode: 'kimi', kimiModelName: '', kimiAuthMethod: 'oauth' })
    const s2 = await readSettings()
    expect(s2.lastModel).toEqual({ provider: 'kimi', modelName: 'kimi-for-coding' })
  })

  it('synthesizes lastModel from a configured Ollama model in self mode', async () => {
    stub({ hostMode: 'self', ollamaModelName: 'llama3:8b' })
    const s = await readSettings()
    expect(s.lastModel).toEqual({ provider: 'ollama', modelName: 'llama3:8b' })
    expect('ollamaModelName' in s).toBe(false)
  })

  it('leaves lastModel unset when self mode had no Ollama model', async () => {
    stub({ hostMode: 'self' })
    const s = await readSettings()
    expect(s.lastModel).toBeUndefined()
  })

  it('does not overwrite an existing lastModel (idempotent re-read)', async () => {
    stub({
      hostMode: 'kimi',
      kimiModelName: 'k3',
      lastModel: { provider: 'ollama', modelName: 'qwen3' }
    })
    const s = await readSettings()
    expect(s.lastModel).toEqual({ provider: 'ollama', modelName: 'qwen3' })
  })

  it('drops all three legacy keys even when no lastModel can be synthesized', async () => {
    stub({ hostMode: 'self', kimiModelName: 'kimi-for-coding', ollamaModelName: '' })
    const s = await readSettings()
    expect('hostMode' in s).toBe(false)
    expect('kimiModelName' in s).toBe(false)
    expect('ollamaModelName' in s).toBe(false)
  })

  it('chains with the old multi-model migration: models[] → ollamaModelName → lastModel', async () => {
    stub({
      hostMode: 'self',
      models: [
        { id: 'a', provider: 'ollama', modelName: 'mistral' },
        { id: 'b', provider: 'ollama', modelName: 'llama3' }
      ],
      defaultModelId: 'b',
      router: {}
    })
    const s = await readSettings()
    expect(s.lastModel).toEqual({ provider: 'ollama', modelName: 'llama3' })
    expect('models' in s).toBe(false)
  })
})
