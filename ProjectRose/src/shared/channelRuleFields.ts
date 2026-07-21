// Parse and serialize Channel Rule definition files (ADR 0015).
//
// Channel Rules live on disk as markdown at
//   <workspace>/.projectrose/channel-rules/{slug}.md
//
// Shape:
//
//   # Channel Rule: Discord #alerts on-call escalation
//   - enabled: true
//   - source: discord
//   - identifier: 1234567890123456789
//   - identifier-display: project-server / #alerts
//   - created: 2026-05-25T11:32:00
//   - last-fired: 2026-05-25T14:08:14
//   - tools:
//     - channels_reply_discord
//     - email_draft
//
//   ## Prompt
//   When a new on-call alert lands, summarize the failing service…
//
// Mirrors `routineFields.ts` so the two extensions stay legible together.
// Pure functions only, no IO — safe to import from either process.

import {
  FALLBACK_EMAIL_IDENTIFIER,
  type ChannelRule,
  type ChannelSource
} from './channelRule'
import {
  parseRuleDocument,
  buildRuleDocument,
  parseBoolean,
  slugify
} from './ruleDocument'

const HEADER_RE = /^\s*#\s*Channel Rule:\s*(.+?)\s*$/i

const KNOWN_LABELS = [
  'enabled',
  'source',
  'identifier',
  'identifier-display',
  'created',
  'last-fired',
  'tools'
] as const

const VALID_SOURCES: ReadonlySet<ChannelSource> = new Set(['discord', 'slack', 'email'])

function coerceSource(value: string): ChannelSource {
  const lower = value.trim().toLowerCase()
  return VALID_SOURCES.has(lower as ChannelSource) ? (lower as ChannelSource) : 'email'
}

/** Slugify a rule name for the on-disk filename. */
export function slugifyChannelRuleName(name: string): string {
  return slugify(name, 'channel-rule')
}

export function emptyChannelRule(): ChannelRule {
  return {
    name: '',
    enabled: true,
    source: 'email',
    identifier: '',
    identifierDisplay: null,
    tools: [],
    createdAt: null,
    lastFiredAt: null,
    sections: {},
    extraBullets: []
  }
}

export function parseChannelRuleContent(content: string): ChannelRule {
  const doc = parseRuleDocument(content, HEADER_RE, KNOWN_LABELS)
  const out = emptyChannelRule()
  out.name = doc.name
  out.tools = doc.tools
  out.extraBullets = doc.extraBullets
  out.sections = doc.sections
  for (const { label, value } of doc.labeled) {
    switch (label) {
      case 'enabled':
        out.enabled = parseBoolean(value)
        break
      case 'source':
        out.source = coerceSource(value)
        break
      case 'identifier':
        out.identifier = value
        break
      case 'identifier-display':
        out.identifierDisplay = value.length > 0 ? value : null
        break
      case 'created':
        out.createdAt = value
        break
      case 'last-fired':
        out.lastFiredAt = value
        break
    }
  }
  return out
}

export function buildChannelRuleMarkdown(rule: ChannelRule): string {
  const name = rule.name.trim() || 'Untitled channel rule'
  const metadata: string[] = [
    `- enabled: ${rule.enabled ? 'true' : 'false'}`,
    `- source: ${rule.source}`,
    `- identifier: ${rule.identifier}`
  ]
  if (rule.identifierDisplay) metadata.push(`- identifier-display: ${rule.identifierDisplay}`)
  if (rule.createdAt) metadata.push(`- created: ${rule.createdAt}`)
  if (rule.lastFiredAt) metadata.push(`- last-fired: ${rule.lastFiredAt}`)
  return buildRuleDocument({
    headerLine: `# Channel Rule: ${name}`,
    metadataBullets: metadata,
    tools: rule.tools,
    extraBullets: rule.extraBullets,
    sections: rule.sections
  })
}

/** Convenience: get the prompt body from a parsed rule. */
export function getChannelRulePrompt(rule: ChannelRule): string {
  return rule.sections['Prompt'] ?? ''
}

/** True when the rule is the email fallback (matches any sender). */
export function isEmailFallbackRule(rule: Pick<ChannelRule, 'source' | 'identifier'>): boolean {
  return rule.source === 'email' && rule.identifier === FALLBACK_EMAIL_IDENTIFIER
}
