// Parse and serialize Routine definition files.
//
// Routines live on disk as markdown at
//   <workspace>/.projectrose/routines/{slug}.md
//
// Shape:
//
//   # Routine: Weekday morning brief
//   - enabled: true
//   - recurrence: RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
//   - fire-time: 09:00
//   - created: 2026-05-24T11:32:00
//   - last-fired: 2026-05-23T09:00:14
//   - tools:
//     - email_list_messages
//     - email_get_message
//     - memory_list_events
//
//   ## Prompt
//   Summarize my 10 most-recent unread emails…
//
// The `# Routine:` header carries the name. Structured metadata lives in
// bullets; the `## Prompt` (and any other `## …` section) collects free-form
// content the agent receives.
//
// Pure functions only, no IO — safe to import from either process.

export interface ParsedRoutine {
  /** Display name (the `# Routine:` header). */
  name: string
  /** Whether the scheduler should fire this routine. */
  enabled: boolean
  /**
   * Raw RRULE strings as they appear in the file. Multiple rules per routine
   * are permitted to mirror the calendar's representation, but the v1 UI
   * editor only emits a single RRULE.
   */
  recurrence: string[]
  /** Local clock HH:MM at which the routine fires on each occurrence. */
  fireTime: string
  /**
   * Tools this routine may use. Empty list = no tools (text-only run).
   * Interactive tools (ask_user, screenshot) are auto-stripped by the host
   * even if listed here.
   */
  tools: string[]
  /** ISO-local datetime when the routine was created. */
  createdAt: string | null
  /** ISO-local datetime of the most recent fire (scheduled or manual). */
  lastFiredAt: string | null
  /** Body sections keyed by header (`Prompt`, …). */
  sections: Record<string, string>
  /** Bullets the parser did not recognise. Preserved on round-trip. */
  extraBullets: string[]
}

import {
  parseRuleDocument,
  buildRuleDocument,
  parseBoolean,
  slugify
} from './ruleDocument'

const HEADER_RE = /^\s*#\s*Routine:\s*(.+?)\s*$/i

const KNOWN_LABELS = [
  'enabled',
  'recurrence',
  'rrule',
  'fire-time',
  'created',
  'last-fired',
  'tools'
] as const

/** Bare rules get the RRULE: prefix; already-prefixed values pass through. */
export function normaliseRrule(value: string): string {
  return value.toUpperCase().startsWith('RRULE:') ? value : `RRULE:${value}`
}

/** Slugify a routine name for the on-disk filename. */
export function slugifyRoutineName(name: string): string {
  return slugify(name, 'routine')
}

export function emptyRoutine(): ParsedRoutine {
  return {
    name: '',
    enabled: true,
    recurrence: [],
    fireTime: '09:00',
    tools: [],
    createdAt: null,
    lastFiredAt: null,
    sections: {},
    extraBullets: []
  }
}

export function parseRoutineContent(content: string): ParsedRoutine {
  const doc = parseRuleDocument(content, HEADER_RE, KNOWN_LABELS)
  const out = emptyRoutine()
  out.name = doc.name
  out.tools = doc.tools
  out.extraBullets = doc.extraBullets
  out.sections = doc.sections
  for (const { label, value } of doc.labeled) {
    switch (label) {
      case 'enabled':
        out.enabled = parseBoolean(value)
        break
      case 'recurrence':
      case 'rrule':
        out.recurrence.push(normaliseRrule(value))
        break
      case 'fire-time':
        out.fireTime = value
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

export function buildRoutineMarkdown(routine: ParsedRoutine): string {
  const name = routine.name.trim() || 'Untitled routine'
  const metadata: string[] = [`- enabled: ${routine.enabled ? 'true' : 'false'}`]
  for (const r of routine.recurrence) metadata.push(`- recurrence: ${r}`)
  metadata.push(`- fire-time: ${routine.fireTime}`)
  if (routine.createdAt) metadata.push(`- created: ${routine.createdAt}`)
  if (routine.lastFiredAt) metadata.push(`- last-fired: ${routine.lastFiredAt}`)
  return buildRuleDocument({
    headerLine: `# Routine: ${name}`,
    metadataBullets: metadata,
    tools: routine.tools,
    extraBullets: routine.extraBullets,
    sections: routine.sections
  })
}

/** Convenience: get the prompt body from a parsed routine. */
export function getRoutinePrompt(routine: ParsedRoutine): string {
  return routine.sections['Prompt'] ?? ''
}
