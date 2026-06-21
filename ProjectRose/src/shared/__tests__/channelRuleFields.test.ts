import { describe, it, expect } from 'vitest'
import {
  parseChannelRuleContent,
  buildChannelRuleMarkdown,
  slugifyChannelRuleName,
  getChannelRulePrompt,
  isEmailFallbackRule,
  emptyChannelRule
} from '../channelRuleFields'

const FULL = `# Channel Rule: Discord #alerts on-call escalation
- enabled: true
- source: discord
- identifier: 1234567890123456789
- identifier-display: project-server / #alerts
- created: 2026-05-25T11:32:00
- last-fired: 2026-05-25T14:08:14
- tools:
  - memory_append
  - email_draft

## Prompt
When a new on-call alert lands, summarize the failing service.
`

describe('parseChannelRuleContent', () => {
  it('parses a full channel rule file', () => {
    const r = parseChannelRuleContent(FULL)
    expect(r.name).toBe('Discord #alerts on-call escalation')
    expect(r.enabled).toBe(true)
    expect(r.source).toBe('discord')
    expect(r.identifier).toBe('1234567890123456789')
    expect(r.identifierDisplay).toBe('project-server / #alerts')
    expect(r.createdAt).toBe('2026-05-25T11:32:00')
    expect(r.lastFiredAt).toBe('2026-05-25T14:08:14')
    expect(r.tools).toEqual(['memory_append', 'email_draft'])
    expect(getChannelRulePrompt(r)).toBe('When a new on-call alert lands, summarize the failing service.')
  })

  it('coerces an unknown source to email', () => {
    expect(parseChannelRuleContent('# Channel Rule: X\n- source: telegram\n').source).toBe('email')
  })

  it('treats an empty identifier-display as null', () => {
    expect(parseChannelRuleContent('# Channel Rule: X\n- identifier-display: \n').identifierDisplay).toBeNull()
  })

  it('accepts inline comma-separated tools and a tools sub-list', () => {
    expect(parseChannelRuleContent('# Channel Rule: X\n- tools: a, b\n').tools).toEqual(['a', 'b'])
    expect(parseChannelRuleContent('# Channel Rule: X\n- tools:\n  - a\n  - b\n').tools).toEqual(['a', 'b'])
  })

  it('preserves unrecognised bullets as extraBullets', () => {
    const r = parseChannelRuleContent('# Channel Rule: X\n- enabled: true\n- mystery: 42\n')
    expect(r.extraBullets).toEqual(['mystery: 42'])
  })
})

describe('buildChannelRuleMarkdown round-trip', () => {
  it('parse → build → parse is stable', () => {
    const a = parseChannelRuleContent(FULL)
    const b = parseChannelRuleContent(buildChannelRuleMarkdown(a))
    expect(b).toEqual(a)
  })

  it('round-trips an unknown bullet', () => {
    const r = parseChannelRuleContent('# Channel Rule: X\n- enabled: true\n- mystery: 42\n')
    expect(buildChannelRuleMarkdown(r)).toContain('- mystery: 42')
  })
})

describe('helpers', () => {
  it('slugifies and falls back to "channel-rule"', () => {
    expect(slugifyChannelRuleName('Discord #alerts!')).toBe('discord-alerts')
    expect(slugifyChannelRuleName('')).toBe('channel-rule')
  })

  it('recognises the email fallback rule', () => {
    const r = emptyChannelRule()
    r.source = 'email'
    r.identifier = '*'
    expect(isEmailFallbackRule(r)).toBe(true)
    r.identifier = 'a@b.com'
    expect(isEmailFallbackRule(r)).toBe(false)
  })
})
