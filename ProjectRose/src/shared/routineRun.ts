// Per-fire run record for rose-routines (ADR 0013). Composes the consumer-
// agnostic DetachedRunTranscript (ADR 0014) with the routine-specific header
// metadata (slug, scheduled-at, trigger) and serializes/parses to the on-disk
// markdown at `<workspace>/.projectrose/routines/{slug}/runs/{ts}.md`.

import {
  buildTranscriptMarkdownBlock,
  parseTranscriptMarkdownBlock,
  type DetachedRunTranscript
} from './detachedRunTranscript'

export type RoutineRunTrigger = 'scheduled' | 'manual'
export type RoutineRunStatus = 'success' | 'failed'

export interface RoutineRunRecord {
  routineSlug: string
  routineName: string
  trigger: RoutineRunTrigger
  status: RoutineRunStatus
  /** ISO datetime the fire was scheduled for (for 'manual' = same as actual). */
  scheduledAt: string
  /** ISO datetime the fire actually started executing. */
  startedAt: string
  /** Prompt text as fired. */
  prompt: string
  transcript: DetachedRunTranscript
  /** Populated only when status === 'failed'. */
  error: string | null
  /** Tool names the routine declared but the host had to drop at fire time. */
  warnings: string[]
}

const HEADER_RE = /^\s*#\s*Run:\s*(.+?)\s*@\s*([0-9T:.\-Z+]+)\s*$/
const BULLET_RE = /^\s*-\s+(.*?)\s*$/
const SECTION_RE = /^\s*##\s+(.+?)\s*$/

const KNOWN_HEADER_LABELS = [
  'routine',
  'routine-name',
  'trigger',
  'status',
  'duration-ms',
  'fire-time-scheduled',
  'fire-time-actual',
  'input-tokens',
  'output-tokens',
  'model',
  'error',
  'warning'
] as const

/**
 * Serialize a single routine run to markdown for storage on disk.
 * The reverse of `parseRunMarkdown`.
 */
export function buildRunMarkdown(run: RoutineRunRecord): string {
  const lines: string[] = []
  lines.push(`# Run: ${run.routineName} @ ${run.scheduledAt}`)
  lines.push(`- routine: ${run.routineSlug}`)
  lines.push(`- trigger: ${run.trigger}`)
  lines.push(`- status: ${run.status}`)
  lines.push(`- fire-time-scheduled: ${run.scheduledAt}`)
  lines.push(`- fire-time-actual: ${run.startedAt}`)
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
  routineName: string
  scheduledAt: string
  routineSlug: string
  trigger: RoutineRunTrigger
  status: RoutineRunStatus
  startedAt: string
  durationMs: number
  inputTokens: number
  outputTokens: number
  modelDisplay: string
  error: string | null
  warnings: string[]
}

function emptyHeader(routineName: string, scheduledAt: string): ParsedRunHeader {
  return {
    routineName,
    scheduledAt,
    routineSlug: '',
    trigger: 'scheduled',
    status: 'success',
    startedAt: scheduledAt,
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    modelDisplay: 'unknown',
    error: null,
    warnings: []
  }
}

/**
 * Parse a run markdown file. Tolerant of missing fields — anything absent
 * gets a sensible default so a partially-written or hand-edited file still
 * loads.
 */
export function parseRunMarkdown(content: string): RoutineRunRecord {
  const lines = content.split(/\r?\n/)
  let header: ParsedRunHeader = emptyHeader('Untitled', '')

  // First pass: header line + bullets, until first '##' section.
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
      case 'routine':
        header.routineSlug = value
        break
      case 'routine-name':
        header.routineName = value
        break
      case 'trigger':
        header.trigger = value === 'manual' ? 'manual' : 'scheduled'
        break
      case 'status':
        header.status = value === 'failed' ? 'failed' : 'success'
        break
      case 'fire-time-scheduled':
        header.scheduledAt = value
        break
      case 'fire-time-actual':
        header.startedAt = value
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

  // Section walker — collect Prompt / Transcript / Final Response sections.
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

  return {
    routineSlug: header.routineSlug,
    routineName: header.routineName,
    trigger: header.trigger,
    status: header.status,
    scheduledAt: header.scheduledAt,
    startedAt: header.startedAt,
    prompt,
    transcript: {
      entries,
      finalText,
      durationMs: header.durationMs,
      inputTokens: header.inputTokens,
      outputTokens: header.outputTokens,
      modelDisplay: header.modelDisplay
    },
    error: header.error,
    warnings: header.warnings
  }
}
