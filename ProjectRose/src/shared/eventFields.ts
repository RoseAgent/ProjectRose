// Parse and serialize Event bullet-note files.
//
// Events live on disk as markdown:
//
//   # Event: Team standup
//   - start: 2026-05-22T14:00 (America/New_York)
//   - end: 2026-05-22T15:00 (America/New_York)
//   - location: Zoom
//   - attendee: alice@example.com (accepted)
//   - attendee: bob@example.com (needsAction)
//   - recurrence: RRULE:FREQ=WEEKLY;BYDAY=TU
//   - google-id: abc123@google.com
//   - google-calendar-id: primary
//   ## Description
//   Weekly sync.
//
// The `# Event:` header carries the summary. Structured metadata lives in
// bullets; the `## Description` (and any other `## …` section) collects
// free-form narrative.
//
// This module is the single source of truth for that bullet shape — used by:
//   • the rose-calendar built-in extension's editor (renderer)
//   • googleCalendar.ts for sync push/pull (main)
//
// Pure functions only, no IO — safe to import from either process.

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled'

export type AttendeeResponseStatus =
  | 'needsAction'
  | 'declined'
  | 'tentative'
  | 'accepted'

export interface ParsedAttendee {
  email: string
  responseStatus: AttendeeResponseStatus
  displayName?: string
  organizer?: boolean
  self?: boolean
}

export interface ParsedEventTime {
  /**
   * ISO date-time without offset (e.g. `2026-05-22T14:00`) for timed events,
   * or ISO date (`2026-05-22`) for all-day events. The companion `timeZone`
   * field disambiguates timed events; all-day events ignore it.
   */
  value: string
  timeZone: string | null
  allDay: boolean
}

export interface ParsedEvent {
  summary: string
  description: string
  status: EventStatus
  location: string | null
  start: ParsedEventTime | null
  end: ParsedEventTime | null
  attendees: ParsedAttendee[]
  /**
   * Raw RRULE strings as they appear in the file. Multiple rules per event
   * are allowed (RFC 5545 permits multiple RRULE lines and/or EXDATE/RDATE).
   */
  recurrence: string[]
  googleId: string | null
  googleCalendarId: string | null
  /** Set on exception files; references the master event's google-id. */
  recurringMasterId: string | null
  /** Original date this exception is replacing, as an ISO date-time. */
  originalStart: ParsedEventTime | null
  /** Bullets the parser didn't recognise. Preserved on round-trip. */
  extraBullets: string[]
  /** Body sections keyed by header (e.g. `Description`, `Notes`). */
  sections: Record<string, string>
}

const HEADER_RE = /^\s*#\s*Event:\s*(.+?)\s*$/i
const BULLET_RE = /^\s*-\s+(.*?)\s*$/
const SECTION_RE = /^\s*##\s+(.+?)\s*$/

const KNOWN_LABELS = [
  'start',
  'end',
  'location',
  'attendee',
  'recurrence',
  'rrule',
  'rdate',
  'exdate',
  'status',
  'google-id',
  'google-calendar-id',
  'recurring-master-id',
  'original-start'
] as const

type Label = typeof KNOWN_LABELS[number]

interface LabeledBullet {
  label: Label
  value: string
  paren: string | null
}

function tryParseLabeled(bullet: string): LabeledBullet | null {
  const m = bullet.match(/^([a-z][a-z0-9-]*)\s*:\s*(.+?)\s*$/i)
  if (!m) return null
  const label = m[1].toLowerCase() as Label
  if (!(KNOWN_LABELS as readonly string[]).includes(label)) return null
  const rest = m[2]
  // The trailing `(…)` carries a type qualifier — timezone for times,
  // response-status for attendees, "all-day" for date-only times.
  const typed = rest.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (typed) return { label, value: typed[1].trim(), paren: typed[2].trim() }
  return { label, value: rest.trim(), paren: null }
}

function parseTimeBullet(value: string, paren: string | null): ParsedEventTime {
  if (paren && paren.toLowerCase() === 'all-day') {
    return { value, timeZone: null, allDay: true }
  }
  // `2026-05-22` with no time → all-day even without the explicit paren.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { value, timeZone: null, allDay: true }
  }
  return { value, timeZone: paren, allDay: false }
}

function parseAttendeeBullet(value: string, paren: string | null): ParsedAttendee {
  // Value can be `email` or `Display Name <email>`. The paren carries the
  // response status (`accepted` / `needsAction` / etc.) with an optional
  // trailing `, organizer` or `, self` flag — keep it simple: the first
  // word is the status.
  const nameEmail = value.match(/^(.+?)\s*<([^>]+)>\s*$/)
  const displayName = nameEmail ? nameEmail[1].trim() : undefined
  const email = nameEmail ? nameEmail[2].trim() : value.trim()
  let responseStatus: AttendeeResponseStatus = 'needsAction'
  let organizer = false
  let self = false
  if (paren) {
    for (const part of paren.split(',').map((p) => p.trim().toLowerCase())) {
      if (part === 'accepted' || part === 'declined' || part === 'tentative' || part === 'needsaction') {
        responseStatus = part === 'needsaction' ? 'needsAction' : (part as AttendeeResponseStatus)
      } else if (part === 'organizer') {
        organizer = true
      } else if (part === 'self') {
        self = true
      }
    }
  }
  const attendee: ParsedAttendee = { email, responseStatus }
  if (displayName) attendee.displayName = displayName
  if (organizer) attendee.organizer = true
  if (self) attendee.self = true
  return attendee
}

function parseStatusBullet(value: string): EventStatus {
  const lower = value.trim().toLowerCase()
  if (lower === 'confirmed' || lower === 'tentative' || lower === 'cancelled') return lower
  return 'confirmed'
}

export function parseEventContent(content: string): ParsedEvent {
  let summary = ''
  const out: ParsedEvent = {
    summary: '',
    description: '',
    status: 'confirmed',
    location: null,
    start: null,
    end: null,
    attendees: [],
    recurrence: [],
    googleId: null,
    googleCalendarId: null,
    recurringMasterId: null,
    originalStart: null,
    extraBullets: [],
    sections: {}
  }

  // Walk twice: first pass collects the header, structured bullets, and free
  // bullets; then we walk sections (lines after the first `## Header` until
  // the next `## Header` or EOF).
  const lines = content.split(/\r?\n/)
  let i = 0
  for (; i < lines.length; i += 1) {
    const line = lines[i]
    if (!summary) {
      const h = line.match(HEADER_RE)
      if (h) { summary = h[1].trim(); continue }
    }
    if (line.match(SECTION_RE)) break // hand off to section walker
    const bm = line.match(BULLET_RE)
    if (!bm) continue
    const bullet = bm[1]
    const labeled = tryParseLabeled(bullet)
    if (!labeled) { out.extraBullets.push(bullet); continue }
    switch (labeled.label) {
      case 'start':
        out.start = parseTimeBullet(labeled.value, labeled.paren)
        break
      case 'end':
        out.end = parseTimeBullet(labeled.value, labeled.paren)
        break
      case 'location':
        out.location = labeled.value
        break
      case 'attendee':
        out.attendees.push(parseAttendeeBullet(labeled.value, labeled.paren))
        break
      case 'recurrence':
      case 'rrule':
      case 'rdate':
      case 'exdate':
        out.recurrence.push(normaliseRruleBullet(labeled.label, labeled.value))
        break
      case 'status':
        out.status = parseStatusBullet(labeled.value)
        break
      case 'google-id':
        out.googleId = labeled.value
        break
      case 'google-calendar-id':
        out.googleCalendarId = labeled.value
        break
      case 'recurring-master-id':
        out.recurringMasterId = labeled.value
        break
      case 'original-start':
        out.originalStart = parseTimeBullet(labeled.value, labeled.paren)
        break
    }
  }
  out.summary = summary

  // Section walk — at this point lines[i] is a `## Header` (or end of input).
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
  out.description = out.sections['Description'] ?? ''
  return out
}

function normaliseRruleBullet(label: 'recurrence' | 'rrule' | 'rdate' | 'exdate', value: string): string {
  // The bullet may already be a full `RRULE:FREQ=...` string, or it may be
  // just the body. Normalise so callers can grep for the prefix.
  const upper = value.toUpperCase()
  if (upper.startsWith('RRULE:') || upper.startsWith('RDATE:') || upper.startsWith('EXDATE:')) return value
  if (label === 'rrule' || label === 'recurrence') return `RRULE:${value}`
  if (label === 'rdate') return `RDATE:${value}`
  if (label === 'exdate') return `EXDATE:${value}`
  return value
}

function emitTime(label: 'start' | 'end' | 'original-start', t: ParsedEventTime): string {
  if (t.allDay) return `${label}: ${t.value} (all-day)`
  if (t.timeZone) return `${label}: ${t.value} (${t.timeZone})`
  return `${label}: ${t.value}`
}

function emitAttendee(a: ParsedAttendee): string {
  const head = a.displayName ? `${a.displayName} <${a.email}>` : a.email
  const parts: string[] = [a.responseStatus]
  if (a.organizer) parts.push('organizer')
  if (a.self) parts.push('self')
  return `attendee: ${head} (${parts.join(', ')})`
}

export function buildEventMarkdown(event: ParsedEvent): string {
  const summary = event.summary.trim() || 'Untitled event'
  const lines: string[] = [`# Event: ${summary}`]
  if (event.start) lines.push(`- ${emitTime('start', event.start)}`)
  if (event.end) lines.push(`- ${emitTime('end', event.end)}`)
  if (event.location) lines.push(`- location: ${event.location}`)
  for (const att of event.attendees) lines.push(`- ${emitAttendee(att)}`)
  for (const rec of event.recurrence) lines.push(`- recurrence: ${rec}`)
  if (event.status && event.status !== 'confirmed') lines.push(`- status: ${event.status}`)
  if (event.googleId) lines.push(`- google-id: ${event.googleId}`)
  if (event.googleCalendarId) lines.push(`- google-calendar-id: ${event.googleCalendarId}`)
  if (event.recurringMasterId) lines.push(`- recurring-master-id: ${event.recurringMasterId}`)
  if (event.originalStart) lines.push(`- ${emitTime('original-start', event.originalStart)}`)
  for (const extra of event.extraBullets) lines.push(`- ${extra}`)

  // Sections: keep Description first when present, then any others.
  const sectionEntries = Object.entries(event.sections).filter(([, body]) => body.trim().length > 0)
  // Honor description field if no explicit Description section exists.
  if (!event.sections['Description'] && event.description.trim().length > 0) {
    sectionEntries.unshift(['Description', event.description.trim()])
  }
  const seen = new Set<string>()
  const orderedSections: Array<[string, string]> = []
  for (const entry of sectionEntries) {
    if (seen.has(entry[0])) continue
    seen.add(entry[0])
    orderedSections.push(entry)
  }
  orderedSections.sort((a, b) => {
    if (a[0] === 'Description') return -1
    if (b[0] === 'Description') return 1
    return a[0].localeCompare(b[0])
  })
  for (const [header, body] of orderedSections) {
    lines.push('', `## ${header}`, body.trim())
  }
  return lines.join('\n') + '\n'
}

export function emptyParsedEvent(): ParsedEvent {
  return {
    summary: '',
    description: '',
    status: 'confirmed',
    location: null,
    start: null,
    end: null,
    attendees: [],
    recurrence: [],
    googleId: null,
    googleCalendarId: null,
    recurringMasterId: null,
    originalStart: null,
    extraBullets: [],
    sections: {}
  }
}
