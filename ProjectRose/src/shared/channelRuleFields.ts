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
//     - memory_append
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

const HEADER_RE = /^\s*#\s*Channel Rule:\s*(.+?)\s*$/i
const BULLET_RE = /^(\s*)-\s+(.*?)\s*$/
const SECTION_RE = /^\s*##\s+(.+?)\s*$/

const KNOWN_LABELS = [
  'enabled',
  'source',
  'identifier',
  'identifier-display',
  'created',
  'last-fired',
  'tools'
] as const

type Label = typeof KNOWN_LABELS[number]

const VALID_SOURCES: ReadonlySet<ChannelSource> = new Set(['discord', 'slack', 'email'])

interface LabeledBullet {
  label: Label
  value: string
  indentSpaces: number
}

function tryParseLabeled(
  indent: number,
  bullet: string
): LabeledBullet | { name: 'unlabeled'; value: string; indentSpaces: number } {
  const m = bullet.match(/^([a-z][a-z0-9-]*)\s*:\s*(.*?)\s*$/i)
  if (!m) return { name: 'unlabeled', value: bullet, indentSpaces: indent }
  const label = m[1].toLowerCase()
  const value = m[2]
  if (!(KNOWN_LABELS as readonly string[]).includes(label)) {
    return { name: 'unlabeled', value: bullet, indentSpaces: indent }
  }
  return { label: label as Label, value: value.trim(), indentSpaces: indent }
}

function parseBoolean(value: string): boolean {
  const lower = value.trim().toLowerCase()
  return lower === 'true' || lower === 'yes' || lower === '1'
}

function coerceSource(value: string): ChannelSource {
  const lower = value.trim().toLowerCase()
  return VALID_SOURCES.has(lower as ChannelSource) ? (lower as ChannelSource) : 'email'
}

/** Slugify a rule name for the on-disk filename. */
export function slugifyChannelRuleName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^\p{Letter}\p{Number}\s-]+/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'channel-rule'
  )
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
  const out = emptyChannelRule()
  let name = ''
  const lines = content.split(/\r?\n/)
  let i = 0
  let inToolsList = false
  for (; i < lines.length; i += 1) {
    const line = lines[i]
    if (!name) {
      const h = line.match(HEADER_RE)
      if (h) {
        name = h[1].trim()
        continue
      }
    }
    if (line.match(SECTION_RE)) break
    const bm = line.match(BULLET_RE)
    if (!bm) {
      inToolsList = false
      continue
    }
    const indent = bm[1].length
    const bullet = bm[2]
    if (inToolsList && indent >= 2) {
      const value = bullet.trim()
      if (value.length > 0) out.tools.push(value)
      continue
    }
    inToolsList = false
    const labeled = tryParseLabeled(indent, bullet)
    if ('name' in labeled && labeled.name === 'unlabeled') {
      out.extraBullets.push(labeled.value)
      continue
    }
    const l = labeled as LabeledBullet
    switch (l.label) {
      case 'enabled':
        out.enabled = parseBoolean(l.value)
        break
      case 'source':
        out.source = coerceSource(l.value)
        break
      case 'identifier':
        out.identifier = l.value
        break
      case 'identifier-display':
        out.identifierDisplay = l.value.length > 0 ? l.value : null
        break
      case 'created':
        out.createdAt = l.value
        break
      case 'last-fired':
        out.lastFiredAt = l.value
        break
      case 'tools':
        if (l.value.length === 0) {
          inToolsList = true
        } else {
          for (const t of l.value.split(',').map((s) => s.trim()).filter(Boolean)) {
            out.tools.push(t)
          }
        }
        break
    }
  }
  out.name = name

  // Section walk.
  let currentHeader: string | null = null
  let buffer: string[] = []
  const flush = (): void => {
    if (!currentHeader) return
    out.sections[currentHeader] = buffer.join('\n').trim()
    buffer = []
  }
  for (; i < lines.length; i += 1) {
    const line = lines[i]
    const sm = line.match(SECTION_RE)
    if (sm) {
      flush()
      currentHeader = sm[1].trim()
      continue
    }
    if (currentHeader) buffer.push(line)
  }
  flush()
  return out
}

export function buildChannelRuleMarkdown(rule: ChannelRule): string {
  const name = rule.name.trim() || 'Untitled channel rule'
  const lines: string[] = [`# Channel Rule: ${name}`]
  lines.push(`- enabled: ${rule.enabled ? 'true' : 'false'}`)
  lines.push(`- source: ${rule.source}`)
  lines.push(`- identifier: ${rule.identifier}`)
  if (rule.identifierDisplay) {
    lines.push(`- identifier-display: ${rule.identifierDisplay}`)
  }
  if (rule.createdAt) lines.push(`- created: ${rule.createdAt}`)
  if (rule.lastFiredAt) lines.push(`- last-fired: ${rule.lastFiredAt}`)
  if (rule.tools.length > 0) {
    lines.push(`- tools:`)
    for (const t of rule.tools) lines.push(`  - ${t}`)
  }
  for (const extra of rule.extraBullets) lines.push(`- ${extra}`)

  const entries = Object.entries(rule.sections).filter(([, body]) => body.trim().length > 0)
  entries.sort((a, b) => {
    if (a[0] === 'Prompt') return -1
    if (b[0] === 'Prompt') return 1
    return a[0].localeCompare(b[0])
  })
  for (const [header, body] of entries) {
    lines.push('', `## ${header}`, body.trim())
  }
  return lines.join('\n') + '\n'
}

/** Convenience: get the prompt body from a parsed rule. */
export function getChannelRulePrompt(rule: ChannelRule): string {
  return rule.sections['Prompt'] ?? ''
}

/** True when the rule is the email fallback (matches any sender). */
export function isEmailFallbackRule(rule: Pick<ChannelRule, 'source' | 'identifier'>): boolean {
  return rule.source === 'email' && rule.identifier === FALLBACK_EMAIL_IDENTIFIER
}
