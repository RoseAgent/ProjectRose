import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe('readSettings provider migration', () => {
  it('drops stale managed and vendor-specific model selections', async () => {
    for (const provider of ['projectrose', 'kimi', 'bedrock']) {
      stub({ lastModel: { provider, modelName: 'old-model' } })
      const settings = await readSettings()
      expect(settings.lastModel).toBeNull()
    }
  })

  it('preserves supported model selections', async () => {
    stub({ lastModel: { provider: 'openai-compatible', modelName: 'gpt-4.1-mini' } })
    expect((await readSettings()).lastModel).toEqual({
      provider: 'openai-compatible',
      modelName: 'gpt-4.1-mini'
    })
  })

  it('migrates the old compatible URL and model list', async () => {
    stub({
      openaiCompatBaseUrl: 'https://api.example.com/v1',
      models: [
        { id: 'a', provider: 'openai-compatible', modelName: 'example-model' }
      ],
      defaultModelId: 'a'
    })
    const settings = await readSettings()
    expect(settings.openaiCompatibleBaseUrl).toBe('https://api.example.com/v1')
    expect(settings.openaiCompatibleModel).toBe('example-model')
    expect('openaiCompatApiKey' in settings).toBe(false)
  })

  it('migrates the old Ollama model into lastModel', async () => {
    stub({ hostMode: 'self', ollamaModelName: 'llama3:8b' })
    const settings = await readSettings()
    expect(settings.lastModel).toEqual({ provider: 'ollama', modelName: 'llama3:8b' })
    expect('hostMode' in settings).toBe(false)
    expect('ollamaModelName' in settings).toBe(false)
  })

  it('uses the default standalone settings on a fresh install', async () => {
    const settings = await readSettings()
    expect(settings.ollamaBaseUrl).toBe('http://localhost:11434')
    expect(settings.openaiCompatibleBaseUrl).toBe('')
    expect(settings.openaiCompatibleModel).toBe('')
  })
})
