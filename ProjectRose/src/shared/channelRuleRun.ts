// Per-fire run record for rose-channels (ADR 0015). Composes a consumer-
// agnostic DetachedRunTranscript (ADR 0014) with channels-specific header
// metadata and serializes/parses to the on-disk markdown at
// `<workspace>/.projectrose/channel-rules/{slug}/runs/{ts}.md`.
//
// Mirrors `routineRun.ts` so the renderer can use a single transcript view
// component for both kinds of fire.

import {
  buildTranscriptMarkdownBlock,
  parseTranscriptMarkdownBlock,
  type DetachedRunTranscript
} from './detachedRunTranscript'
import type {
  ChannelRuleRunRecord,
  ChannelRuleRunStatus,
  ChannelRuleRunTrigger,
  ChannelSource
} from './channelRule'

const HEADER_RE = /^\s*#\s*Run:\s*(.+?)\s*@\s*([0-9T:.\-Z+]+)\s*$/
const BULLET_RE = /^\s*-\s+(.*?)\s*$/
const SECTION_RE = /^\s*##\s+(.+?)\s*$/

const KNOWN_HEADER_LABELS = [
  'rule',
  'rule-name',
  'source',
  'identifier',
  'identifier-display',
  'trigger',
  'status',
  'arrived-at',
  'started-at',
  'message-id',
  'message-author',
  'message-excerpt',
  'duration-ms',
  'input-tokens',
  'output-tokens',
  'model',
  'error',
  'warning'
] as const

const VALID_SOURCES: ReadonlySet<ChannelSource> = new Set(['discord', 'slack', 'email'])

export function buildChannelRuleRunMarkdown(run: ChannelRuleRunRecord): string {
  const lines: string[] = []
  lines.push(`# Run: ${run.ruleName} @ ${run.arrivedAt}`)
  lines.push(`- rule: ${run.ruleSlug}`)
  lines.push(`- source: ${run.source}`)
  lines.push(`- identifier: ${run.identifier}`)
  if (run.identifierDisplay) lines.push(`- identifier-display: ${run.identifierDisplay}`)
  lines.push(`- trigger: ${run.trigger}`)
  lines.push(`- status: ${run.status}`)
  lines.push(`- arrived-at: ${run.arrivedAt}`)
  lines.push(`- started-at: ${run.startedAt}`)
  lines.push(`- message-id: ${run.sourceMessage.id}`)
  lines.push(`- message-author: ${run.sourceMessage.author}`)
  lines.push(`- message-excerpt: ${run.sourceMessage.excerpt.replace(/\r?\n/g, ' ')}`)
  lines.push(`- duration-ms: ${run.transcript.durationMs}`)
  lines.push(`- input-tokens: ${run.transcript.inputTokens}`)
  lines.push(`- output-tokens: ${run.transcript.outputTokens}`)
  lines.push(`- model: ${run.transcript.modelDisplay}`)
  if (run.error) lines.push(`- error: ${run.error.replace(/\r?\n/g, ' ')}`)
  for (const w of run.warnings) lines.push(`- warning: ${w}`)

  lines.push('', '## Prompt', run.prompt.trim())
  lines.push('', buildTranscriptMarkdownBlock(run.transcript))

  return lines.join('\n') + '\n'
}

interface ParsedRunHeader {
  ruleName: string
  arrivedAt: string
  ruleSlug: string
  source: ChannelSource
  identifier: string
  identifierDisplay: string | null
  trigger: ChannelRuleRunTrigger
  status: ChannelRuleRunStatus
  startedAt: string
  sourceMessage: {
    id: string
    author: string
    excerpt: string
  }
  durationMs: number
  inputTokens: number
  outputTokens: number
  modelDisplay: string
  error: string | null
  warnings: string[]
}

function emptyHeader(ruleName: string, arrivedAt: string): ParsedRunHeader {
  return {
    ruleName,
    arrivedAt,
    ruleSlug: '',
    source: 'email',
    identifier: '',
    identifierDisplay: null,
    trigger: 'message',
    status: 'success',
    startedAt: arrivedAt,
    sourceMessage: { id: '', author: '', excerpt: '' },
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    modelDisplay: 'unknown',
    error: null,
    warnings: []
  }
}

export function parseChannelRuleRunMarkdown(content: string): ChannelRuleRunRecord {
  const lines = content.split(/\r?\n/)
  let header: ParsedRunHeader = emptyHeader('Untitled', '')

  let i = 0
  for (; i < lines.length; i += 1) {
    const line = lines[i]
    const h = line.match(HEADER_RE)
    if (h) {
      header = emptyHeader(h[1].trim(), h[2].trim())
      continue
    }
    if (line.match(SECTION_RE)) break
    const bm = line.match(BULLET_RE)
    if (!bm) continue
    const bullet = bm[1]
    const colon = bullet.indexOf(':')
    if (colon < 0) continue
    const label = bullet.slice(0, colon).trim().toLowerCase()
    const value = bullet.slice(colon + 1).trim()
    if (!(KNOWN_HEADER_LABELS as readonly string[]).includes(label)) continue
    switch (label) {
      case 'rule':
        header.ruleSlug = value
        break
      case 'rule-name':
        header.ruleName = value
        break
      case 'source':
        if (VALID_SOURCES.has(value as ChannelSource)) header.source = value as ChannelSource
        break
      case 'identifier':
        header.identifier = value
        break
      case 'identifier-display':
        header.identifierDisplay = value.length > 0 ? value : null
        break
      case 'trigger':
        header.trigger = value === 'manual' ? 'manual' : 'message'
        break
      case 'status':
        header.status = value === 'failed' ? 'failed' : 'success'
        break
      case 'arrived-at':
        header.arrivedAt = value
        break
      case 'started-at':
        header.startedAt = value
        break
      case 'message-id':
        header.sourceMessage.id = value
        break
      case 'message-author':
        header.sourceMessage.author = value
        break
      case 'message-excerpt':
        header.sourceMessage.excerpt = value
        break
      case 'duration-ms':
        header.durationMs = Number.parseInt(value, 10) || 0
        break
      case 'input-tokens':
        header.inputTokens = Number.parseInt(value, 10) || 0
        break
      case 'output-tokens':
        header.outputTokens = Number.parseInt(value, 10) || 0
        break
      case 'model':
        header.modelDisplay = value
        break
      case 'error':
        header.error = value
        break
      case 'warning':
        header.warnings.push(value)
        break
    }
  }

  const sections: Record<string, string[]> = {}
  let current: string | null = null
  for (; i < lines.length; i += 1) {
    const line = lines[i]
    const sm = line.match(SECTION_RE)
    if (sm) {
      current = sm[1].trim()
      if (!sections[current]) sections[current] = []
      continue
    }
    if (current) {
      const arr = sections[current]
      if (arr) arr.push(line)
    }
  }

  const prompt = (sections['Prompt'] ?? []).join('\n').trim()
  const finalText = (sections['Final Response'] ?? []).join('\n').trim()
  const entries = parseTranscriptMarkdownBlock(sections['Transcript'] ?? [])

  const transcript: DetachedRunTranscript = {
    entries,
    finalText,
    durationMs: header.durationMs,
    inputTokens: header.inputTokens,
    outputTokens: header.outputTokens,
    modelDisplay: header.modelDisplay
  }

  return {
    ruleSlug: header.ruleSlug,
    ruleName: header.ruleName,
    source: header.source,
    identifier: header.identifier,
    identifierDisplay: header.identifierDisplay,
    trigger: header.trigger,
    status: header.status,
    arrivedAt: header.arrivedAt,
    startedAt: header.startedAt,
    sourceMessage: header.sourceMessage,
    prompt,
    transcript,
    error: header.error,
    warnings: header.warnings
  }
}
