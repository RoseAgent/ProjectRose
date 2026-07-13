// Host tool handlers for Memory.Event (rose-calendar). Same signature as
// memory/tools.ts — (input, projectRoot, toolCtx) => Promise<string> — so
// they plug into buildCoreTools() via wrapExecute.

import {
  createEvent,
  deleteEvent,
  findEventByGoogleId,
  listEventsForRange,
  readEvent,
  updateEvent
} from './calendar'
import { googleCalendarDeleteRemote } from './googleCalendar'
import { inviteAttendeesToEvent } from './calendarInvite'
import type {
  EventAttendee,
  EventRef,
  EventTime,
  ResolvedEventOccurrence
} from '../../../shared/memory'

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : fallback
}

function coerceTime(value: unknown, allDay: boolean, timeZone: string | null): EventTime | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return { value: trimmed, timeZone: timeZone ?? null, allDay }
}

function coerceAttendees(value: unknown): EventAttendee[] {
  if (!Array.isArray(value)) return []
  const out: EventAttendee[] = []
  for (const raw of value) {
    if (typeof raw === 'string' && raw.includes('@')) {
      out.push({ email: raw.trim(), responseStatus: 'needsAction' })
    } else if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>
      const email = asString(obj.email).trim()
      if (!email) continue
      out.push({
        email,
        displayName: typeof obj.displayName === 'string' ? obj.displayName : undefined,
        responseStatus: (typeof obj.responseStatus === 'string' ? obj.responseStatus : 'needsAction') as EventAttendee['responseStatus']
      })
    }
  }
  return out
}

function resolveRef(input: Record<string, unknown>): EventRef | null {
  const date = asString(input.date)
  const slug = asString(input.slug)
  if (date && slug) return { date, slug }
  return null
}

async function resolveByAnyRef(input: Record<string, unknown>): Promise<EventRef | null> {
  const direct = resolveRef(input)
  if (direct) return direct
  const googleId = asString(input.google_id || input.googleId)
  if (googleId) {
    const ev = await findEventByGoogleId(googleId)
    if (ev) return ev.ref
  }
  return null
}

function formatOccurrenceLine(occ: ResolvedEventOccurrence): string {
  const tag = occ.isException ? ' (exception)' : occ.isRecurringInstance ? ' (recurring)' : ''
  const start = occ.start.value
  const end = occ.end.value
  const summary = occ.master.summary || '(untitled)'
  const ref = `${occ.master.ref.date}/${occ.master.ref.slug}`
  return `${start} → ${end} — ${summary}${tag} [${ref}]`
}

// ─── Tool handlers ───────────────────────────────────────────────────────

export async function handleCalendarCreateEvent(input: Record<string, unknown>): Promise<string> {
  const summary = asString(input.summary).trim()
  if (!summary) return 'Missing `summary`.'
  const allDay = input.allDay === true
  const timeZone = asString(input.timeZone) || null
  const start = coerceTime(input.start, allDay, timeZone)
  const end = coerceTime(input.end, allDay, timeZone) ?? start
  if (!start || !end) return 'Missing `start` (and `end` falls back to start). Use ISO 8601 — `2026-05-22T14:00` for timed, `2026-05-22` for all-day.'

  const recurrence = Array.isArray(input.recurrence) ? input.recurrence.filter((r): r is string => typeof r === 'string') : undefined
  const event = await createEvent({
    summary,
    start,
    end,
    description: asString(input.description) || undefined,
    location: asString(input.location) || undefined,
    attendees: coerceAttendees(input.attendees),
    recurrence,
    calendarId: asString(input.calendarId) || undefined
  })
  return `Created event "${event.summary}" at ${start.value}. Ref: ${event.ref.date}/${event.ref.slug}.`
}

export async function handleCalendarEditEvent(input: Record<string, unknown>): Promise<string> {
  const ref = await resolveByAnyRef(input)
  if (!ref) return 'Missing event ref — pass `date` + `slug`, or `google_id`.'
  const allDay = input.allDay === true
  const timeZone = asString(input.timeZone) || null
  const patch: Parameters<typeof updateEvent>[1] = {}
  if (typeof input.summary === 'string') patch.summary = input.summary
  if (typeof input.description === 'string') patch.description = input.description
  if (typeof input.location === 'string') patch.location = input.location
  if (typeof input.status === 'string') patch.status = input.status as 'confirmed' | 'tentative' | 'cancelled'
  if (typeof input.start === 'string') patch.start = coerceTime(input.start, allDay, timeZone) ?? undefined
  if (typeof input.end === 'string') patch.end = coerceTime(input.end, allDay, timeZone) ?? undefined
  if (Array.isArray(input.attendees)) patch.attendees = coerceAttendees(input.attendees)
  if (Array.isArray(input.recurrence)) patch.recurrence = input.recurrence.filter((r): r is string => typeof r === 'string')

  const updated = await updateEvent(ref, patch)
  if (!updated) return `No event found at ${ref.date}/${ref.slug}.`
  return `Updated "${updated.summary}" at ${ref.date}/${ref.slug}.`
}

export async function handleCalendarGetEvent(input: Record<string, unknown>): Promise<string> {
  const ref = await resolveByAnyRef(input)
  if (!ref) return 'Missing event ref — pass `date` + `slug`, or `google_id`.'
  const event = await readEvent(ref)
  if (!event) return `No event at ${ref.date}/${ref.slug}.`
  return JSON.stringify(event, null, 2)
}

export async function handleCalendarListEvents(input: Record<string, unknown>): Promise<string> {
  const start = asString(input.start)
  const end = asString(input.end)
  if (!start || !end) return 'Missing `start` and `end` (ISO 8601, inclusive lower bound and exclusive upper bound).'
  const calendarIds = Array.isArray(input.calendarIds) ? input.calendarIds.filter((c): c is string => typeof c === 'string') : undefined
  const max = asNumber(input.limit, 100)
  const occurrences = await listEventsForRange({ start, end, calendarIds })
  if (occurrences.length === 0) return 'No events in that range.'
  const lines = occurrences.slice(0, Math.max(1, max)).map(formatOccurrenceLine)
  if (occurrences.length > max) lines.push(`…and ${occurrences.length - max} more`)
  return lines.join('\n')
}

export async function handleCalendarInviteToEvent(input: Record<string, unknown>): Promise<string> {
  const ref = await resolveByAnyRef(input)
  if (!ref) return 'Missing event ref — pass `date` + `slug`, or `google_id`.'
  const outcome = await inviteAttendeesToEvent(ref, coerceAttendees(input.attendees))
  switch (outcome.status) {
    case 'no-event':
      return `No event at ${ref.date}/${ref.slug}.`
    case 'not-synced':
      return 'This event has not been synced to Google. Push it first (Settings → Calendar → Push to Google), then invitations can be sent via Google.'
    case 'no-attendees':
      return 'Provide `attendees` as an array of email strings or objects with `email`.'
    case 'sent':
      return outcome.result.ok ? outcome.result.message : `Invite failed: ${outcome.result.message}`
  }
}

export async function handleCalendarDeleteEvent(input: Record<string, unknown>): Promise<string> {
  const ref = await resolveByAnyRef(input)
  if (!ref) return 'Missing event ref — pass `date` + `slug`, or `google_id`.'
  const event = await readEvent(ref)
  if (!event) return `No event at ${ref.date}/${ref.slug}.`
  // If synced, ask Google to delete first (which also emails any attendees).
  if (event.googleId && event.googleCalendarId) {
    const remote = await googleCalendarDeleteRemote({
      googleId: event.googleId,
      googleCalendarId: event.googleCalendarId
    })
    if (!remote.ok) return `Remote delete failed: ${remote.message}`
  }
  await deleteEvent(ref)
  return `Deleted ${ref.date}/${ref.slug}.`
}
