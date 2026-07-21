import { describe, it, expect } from 'vitest'
import { buildPickerGroups, defaultChoice, choiceId, type PickerAvailability } from '../modelPickerOptions'

function availability(overrides: Partial<PickerAvailability> = {}): PickerAvailability {
  return {
    externalSource: null,
    prLoggedIn: false,
    kimiAvailable: false,
    kimiAuthMethod: 'oauth',
    kimiModels: [],
    ollamaConfigured: false,
    ollamaModels: [],
    bedrockConfigured: false,
    bedrockModels: [],
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

  it('lists one Kimi option per fetched model id, only when available', () => {
    const groups = buildPickerGroups(
      availability({ kimiAvailable: true, kimiModels: ['kimi-k3', 'kimi-k2.6'] })
    )
    expect(groups[0].label).toBe('Kimi')
    expect(groups[0].options.map((o) => o.label)).toEqual(['kimi-k3', 'kimi-k2.6'])
  })

  it('shows no Kimi group until models have been fetched', () => {
    // Available but the live /models fetch hasn't landed yet → no stale guess.
    expect(buildPickerGroups(availability({ kimiAvailable: true, kimiModels: [] }))).toEqual([])
  })

  it('lists one Bedrock option per fetched model id, only when configured', () => {
    const groups = buildPickerGroups(
      availability({
        bedrockConfigured: true,
        bedrockModels: ['anthropic.claude-sonnet-4-5-20250929-v1:0', 'us.amazon.nova-pro-v1:0']
      })
    )
    expect(groups[0].label).toBe('Amazon Bedrock')
    expect(groups[0].options.map((o) => o.label)).toEqual([
      'anthropic.claude-sonnet-4-5-20250929-v1:0',
      'us.amazon.nova-pro-v1:0'
    ])
    expect(groups[0].options[0].choice).toEqual({
      kind: 'rose',
      model: { provider: 'bedrock', modelName: 'anthropic.claude-sonnet-4-5-20250929-v1:0' }
    })
  })

  it('shows no Bedrock group until models have been fetched', () => {
    // Credentials stored but the control-plane listing hasn't landed (or
    // failed) → no stale guess, same contract as Kimi.
    expect(buildPickerGroups(availability({ bedrockConfigured: true }))).toEqual([])
  })

  it('orders Bedrock between Kimi and Ollama', () => {
    const groups = buildPickerGroups(
      availability({
        prLoggedIn: true,
        kimiAvailable: true,
        kimiModels: ['kimi-k3'],
        bedrockConfigured: true,
        bedrockModels: ['anthropic.claude-sonnet-4-5-20250929-v1:0'],
        ollamaConfigured: true,
        ollamaModels: ['llama3']
      })
    )
    expect(groups.map((g) => g.label)).toEqual([
      'ProjectRose',
      'Kimi',
      'Amazon Bedrock',
      'Ollama'
    ])
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
