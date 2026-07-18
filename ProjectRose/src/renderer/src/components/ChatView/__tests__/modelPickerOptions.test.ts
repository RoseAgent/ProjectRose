import { describe, it, expect } from 'vitest'
import { buildPickerGroups, defaultChoice, choiceId, type PickerAvailability } from '../modelPickerOptions'

function availability(overrides: Partial<PickerAvailability> = {}): PickerAvailability {
  return {
    externalSource: null,
    prLoggedIn: false,
    kimiAvailable: false,
    kimiAuthMethod: 'oauth',
    ollamaConfigured: false,
    ollamaModels: [],
    ...overrides
  }
}

describe('buildPickerGroups', () => {
  it('returns nothing when no provider is available', () => {
    expect(buildPickerGroups(availability())).toEqual([])
  })

  it('never offers CLI options on Rose conversations', () => {
    const groups = buildPickerGroups(availability({ prLoggedIn: true }))
    expect(groups.map((g) => g.label)).toEqual(['ProjectRose'])
  })

  it('leads with the Claude group on an external Claude session', () => {
    const groups = buildPickerGroups(
      availability({ externalSource: 'claude-code', prLoggedIn: true })
    )
    expect(groups[0].label).toBe('Claude')
    expect(groups[0].options.map((o) => o.label)).toEqual(['Default', 'Opus', 'Sonnet', 'Haiku'])
    expect(groups[1].label).toBe('ProjectRose')
  })

  it('offers the Codex group only on Codex sessions', () => {
    const claude = buildPickerGroups(availability({ externalSource: 'claude-code' }))
    expect(claude.some((g) => g.label === 'Codex')).toBe(false)
    const codex = buildPickerGroups(availability({ externalSource: 'codex' }))
    expect(codex[0].label).toBe('Codex')
  })

  it('kimi model list follows the auth method', () => {
    const oauth = buildPickerGroups(availability({ kimiAvailable: true, kimiAuthMethod: 'oauth' }))
    expect(oauth[0].options.some((o) => o.id.includes('kimi-for-coding'))).toBe(true)
    const apikey = buildPickerGroups(availability({ kimiAvailable: true, kimiAuthMethod: 'apikey' }))
    expect(apikey[0].options.some((o) => o.id.includes('kimi-for-coding'))).toBe(false)
    expect(apikey[0].options.some((o) => o.id.includes('kimi-k2-thinking'))).toBe(true)
  })

  it('lists one option per installed Ollama model, only when configured', () => {
    const groups = buildPickerGroups(
      availability({ ollamaConfigured: true, ollamaModels: ['llama3', 'qwen3'] })
    )
    expect(groups[0].label).toBe('Ollama')
    expect(groups[0].options.map((o) => o.label)).toEqual(['llama3', 'qwen3'])
    // Configured but nothing installed → no group.
    expect(buildPickerGroups(availability({ ollamaConfigured: true }))).toEqual([])
  })
})

describe('defaultChoice', () => {
  it('prefers the CLI Default option on an external session', () => {
    const groups = buildPickerGroups(
      availability({ externalSource: 'claude-code', prLoggedIn: true })
    )
    const choice = defaultChoice(groups, { provider: 'projectrose', modelName: 'managed' })
    expect(choice).toEqual({ kind: 'cli', cli: 'claude', modelFlag: null })
  })

  it('uses lastModel on Rose conversations even if not in the fetched groups', () => {
    const groups = buildPickerGroups(availability({ prLoggedIn: true }))
    const choice = defaultChoice(groups, { provider: 'ollama', modelName: 'llama3' })
    expect(choice).toEqual({ kind: 'rose', model: { provider: 'ollama', modelName: 'llama3' } })
  })

  it('falls back to the first available option, then null', () => {
    const groups = buildPickerGroups(availability({ prLoggedIn: true, kimiAvailable: true }))
    const choice = defaultChoice(groups, null)
    expect(choice).toEqual({ kind: 'rose', model: { provider: 'projectrose', modelName: 'managed' } })
    expect(defaultChoice([], null)).toBeNull()
  })
})

describe('choiceId', () => {
  it('distinguishes rose and cli choices', () => {
    expect(choiceId({ kind: 'rose', model: { provider: 'kimi', modelName: 'k3' } })).toBe('rose:kimi:k3')
    expect(choiceId({ kind: 'cli', cli: 'claude', modelFlag: null })).toBe('cli:claude:default')
    expect(choiceId({ kind: 'cli', cli: 'codex', modelFlag: 'gpt-5' })).toBe('cli:codex:gpt-5')
  })
})
