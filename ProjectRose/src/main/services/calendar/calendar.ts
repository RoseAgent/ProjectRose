// Event service — one file per event under
// `~/.rose/calendar/{yyyy}/{mm}/{dd}/{slug}.md`. Recurring masters are
// filed at the first-occurrence date and carry the RRULE in a bullet; the
// runtime expands occurrences via the `rrule` library when callers ask for a
// date range. Exception instances (Google's single-occurrence overrides) are
// stored as their own files linking back to the master via `recurring-master-id`.

import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises'
import { dirname } from 'path'
import { RRule, RRuleSet } from 'rrule'

import { agentCalendarDir } from '../../lib/agentHome'
import {
  buildEventMarkdown,
  parseEventContent,
  emptyParsedEvent,
  type ParsedEvent
} from '../../../shared/eventFields'
import type {
  CalendarEvent,
  CalendarRangeQuery,
  CreateEventInput,
  EventRef,
  EventTime,
  ResolvedEventOccurrence,
  UpdateEventPatch
} from '../../../shared/calendar'
import {
  calendarDayDir,
  calendarEventPath,
  calendarMonthDir,
  calendarYearDir,
  slugifyForFilename,
  splitYmd
} from './paths'

// ─── Slug + ref helpers ──────────────────────────────────────────────────

async function safeReaddir(dir: string): Promise<string[]> {
  try { return await readdir(dir) } catch { return [] }
}

/** Compute an available slug in the given day-dir. Adds -2, -3, … on collision. */
async function pickFreeSlug(date: { year: string; month: string; day: string }, base: string): Promise<string> {
  const slug = slugifyForFilename(base)
  const dir = calendarDayDir(date.year, date.month, date.day)
  const existing = new Set(await safeReaddir(dir))
  if (!existing.has(`${slug}.md`)) return slug
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${slug}-${n}`
    if (!existing.has(`${candidate}.md`)) return candidate
  }
  throw new Error(`Too many slug collisions for ${slug}`)
}

function refForPath(year: string, month: string, day: string, filename: string): EventRef {
  return { date: `${year}-${month}-${day}`, slug: filename.replace(/\.md$/, '') }
}

function pathForRef(ref: EventRef): string | null {
  const parts = splitYmd(ref.date)
  if (!parts) return null
  return calendarEventPath(parts, ref.slug)
}

function eventFromParsed(ref: EventRef, parsed: ParsedEvent): CalendarEvent {
  const path = pathForRef(ref)!
  return {
    ref,
    path,
    summary: parsed.summary,
    description: parsed.description || (parsed.sections['Description'] ?? ''),
    status: parsed.status,
    location: parsed.location,
    start: parsed.start,
    end: parsed.end,
    attendees: parsed.attendees,
    recurrence: parsed.recurrence,
    googleId: parsed.googleId,
    googleCalendarId: parsed.googleCalendarId,
    recurringMasterId: parsed.recurringMasterId,
    originalStart: parsed.originalStart
  }
}

function parsedFromEvent(event: CalendarEvent): ParsedEvent {
  const base = emptyParsedEvent()
  return {
    ...base,
    summary: event.summary,
    description: event.description,
    status: event.status,
    location: event.location,
    start: event.start,
    end: event.end,
    attendees: event.attendees,
    recurrence: event.recurrence,
    googleId: event.googleId,
    googleCalendarId: event.googleCalendarId,
    recurringMasterId: event.recurringMasterId,
    originalStart: event.originalStart,
    sections: event.description ? { Description: event.description } : {}
  }
}

// ─── Read / write / delete ───────────────────────────────────────────────

export async function readEvent(ref: EventRef): Promise<CalendarEvent | null> {
  const file = pathForRef(ref)
  if (!file) return null
  try {
    const raw = await readFile(file, 'utf-8')
    return eventFromParsed(ref, parseEventContent(raw))
  } catch {
    return null
  }
}

export async function writeEventRaw(ref: EventRef, parsed: ParsedEvent): Promise<CalendarEvent> {
  const file = pathForRef(ref)
  if (!file) throw new Error(`Invalid event ref: ${ref.date}/${ref.slug}`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, buildEventMarkdown(parsed), 'utf-8')
  return eventFromParsed(ref, parsed)
}

export async function deleteEvent(ref: EventRef): Promise<void> {
  const file = pathForRef(ref)
  if (!file) return
  await unlink(file).catch(() => { /* tolerate */ })
}

export async function eventExists(ref: EventRef): Promise<boolean> {
  return (await readEvent(ref)) !== null
}

// ─── Indexing ────────────────────────────────────────────────────────────

export async function listAllEvents(): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = []
  const root = agentCalendarDir()
  const years = (await safeReaddir(root)).filter((y) => /^\d{4}$/.test(y))
  for (const year of years) {
    const months = (await safeReaddir(calendarYearDir(year))).filter((m) => /^\d{2}$/.test(m))
    for (const month of months) {
      const days = (await safeReaddir(calendarMonthDir(year, month))).filter((d) => /^\d{2}$/.test(d))
      for (const day of days) {
        const files = (await safeReaddir(calendarDayDir(year, month, day))).filter((f) => f.endsWith('.md') && f !== '.gitkeep')
        for (const file of files) {
          const ref = refForPath(year, month, day, file)
          const event = await readEvent(ref)
          if (event) out.push(event)
        }
      }
    }
  }
  return out
}

export async function findEventByGoogleId(googleId: string): Promise<CalendarEvent | null> {
  const all = await listAllEvents()
  return all.find((e) => e.googleId === googleId) ?? null
}

export async function findAllEventsByGoogleId(googleId: string): Promise<CalendarEvent[]> {
  const all = await listAllEvents()
  return all.filter((e) => e.googleId === googleId)
}

// ─── Range listing + RRULE expansion ────────────────────────────────────

function rangeToBounds(range: CalendarRangeQuery): { rangeStart: Date; rangeEnd: Date } {
  return { rangeStart: new Date(range.start), rangeEnd: new Date(range.end) }
}

function eventTimeToDate(t: EventTime): Date | null {
  if (!t) return null
  return new Date(t.value)
}

function addDateOffsetToTime(t: EventTime, offsetMs: number): EventTime {
  const d = new Date(t.value)
  const shifted = new Date(d.getTime() + offsetMs)
  return { ...t, value: t.allDay ? shifted.toISOString().slice(0, 10) : shifted.toISOString().slice(0, 19) }
}

function intersectsRange(start: Date | null, end: Date | null, rangeStart: Date, rangeEnd: Date): boolean {
  if (!start) return false
  const effectiveEnd = end ?? start
  return start < rangeEnd && effectiveEnd > rangeStart
}

function dtstartForEvent(event: CalendarEvent): Date | null {
  if (!event.start) return null
  if (event.start.allDay) {
    const m = event.start.value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (!m) return null
    // All-day rrules are anchored at midnight UTC of the calendar date; rrule
    // returns Dates in UTC and we read them back via toISOString().slice(0,10),
    // which round-trips exactly when dtstart is UTC midnight.
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  }
  const d = new Date(event.start.value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Build an RRule (or RRuleSet) from an event's recurrence bullets.
 *
 * Originally this called `rrulestr('DTSTART;VALUE=DATE:…\nRRULE:…')`. In
 * rrule.js v2.8 that path silently ignored the DTSTART line and defaulted
 * dtstart to *now* — so a yearly recurrence anchored to 2025-12-08 expanded
 * into today's date instead. We now parse just the rule body via
 * `RRule.parseString` and construct the RRule programmatically with an
 * explicit `dtstart`, which is unambiguous.
 */
function parseRecurrenceBlock(event: CalendarEvent): RRuleSet | RRule | null {
  if (event.recurrence.length === 0 || !event.start) return null
  const dtstart = dtstartForEvent(event)
  if (!dtstart) return null

  const rruleBodies: string[] = []
  for (const raw of event.recurrence) {
    const line = raw.trim()
    if (!line) continue
    if (/^RRULE:/i.test(line)) {
      rruleBodies.push(line.replace(/^RRULE:/i, ''))
    } else if (/^FREQ=/i.test(line)) {
      // Tolerate bullets stored without the `RRULE:` prefix.
      rruleBodies.push(line)
    }
    // RDATE/EXDATE are not yet expanded here — exceptions are stored as
    // separate event files linking back via recurring-master-id.
  }
  if (rruleBodies.length === 0) return null

  try {
    if (rruleBodies.length === 1) {
      const options = RRule.parseString(rruleBodies[0])
      return new RRule({ ...options, dtstart })
    }
    const set = new RRuleSet()
    for (const body of rruleBodies) {
      const options = RRule.parseString(body)
      set.rrule(new RRule({ ...options, dtstart }))
    }
    return set
  } catch (err) {
    console.warn('[calendar] parseRecurrenceBlock failed', err, event.recurrence)
    return null
  }
}

export async function listEventsForRange(range: CalendarRangeQuery): Promise<ResolvedEventOccurrence[]> {
  const all = await listAllEvents()
  const { rangeStart, rangeEnd } = rangeToBounds(range)
  const calendarFilter = range.calendarIds && range.calendarIds.length > 0 ? new Set(range.calendarIds) : null

  const out: ResolvedEventOccurrence[] = []

  // Build a quick lookup of exceptions by recurring-master-id so we can hide
  // the synthetic occurrence they replace.
  const exceptionMasters = new Set<string>()
  const exceptionOriginalDates = new Map<string, Set<string>>()
  for (const event of all) {
    if (event.recurringMasterId && event.originalStart) {
      exceptionMasters.add(event.recurringMasterId)
      const set = exceptionOriginalDates.get(event.recurringMasterId) ?? new Set<string>()
      set.add(event.originalStart.value)
      exceptionOriginalDates.set(event.recurringMasterId, set)
    }
  }

  for (const event of all) {
    if (calendarFilter && event.googleCalendarId && !calendarFilter.has(event.googleCalendarId)) continue

    // Exceptions: emit as concrete one-off occurrences.
    if (event.recurringMasterId) {
      if (!event.start || !event.end) continue
      const start = new Date(event.start.value)
      const end = new Date(event.end.value)
      if (!intersectsRange(start, end, rangeStart, rangeEnd)) continue
      out.push({
        master: event,
        start: event.start,
        end: event.end,
        isRecurringInstance: false,
        isException: true
      })
      continue
    }

    if (event.recurrence.length === 0) {
      // Single-instance event.
      const start = eventTimeToDate(event.start!) ?? null
      const end = eventTimeToDate(event.end ?? event.start!) ?? null
      if (!intersectsRange(start, end, rangeStart, rangeEnd)) continue
      out.push({
        master: event,
        start: event.start!,
        end: event.end ?? event.start!,
        isRecurringInstance: false,
        isException: false
      })
      continue
    }

    // Recurring master — expand into occurrences inside the range.
    const rule = parseRecurrenceBlock(event)
    if (!rule || !event.start || !event.end) continue
    const durationMs = new Date(event.end.value).getTime() - new Date(event.start.value).getTime()
    const occurrences = rule.between(rangeStart, rangeEnd, true)
    const skipDates = event.googleId ? (exceptionOriginalDates.get(event.googleId) ?? new Set<string>()) : new Set<string>()
    for (const occStart of occurrences) {
      const iso = event.start.allDay ? occStart.toISOString().slice(0, 10) : occStart.toISOString().slice(0, 19)
      if (skipDates.has(iso)) continue
      const startTime: EventTime = { ...event.start, value: iso }
      const endTime = addDateOffsetToTime(startTime, durationMs)
      out.push({
        master: event,
        start: startTime,
        end: endTime,
        isRecurringInstance: true,
        isException: false
      })
    }
  }

  out.sort((a, b) => {
    const da = new Date(a.start.value).getTime()
    const db = new Date(b.start.value).getTime()
    return da - db
  })
  return out
}

// ─── Higher-level helpers used by the tools / IPC ───────────────────────

/**
 * Permissive date extractor for an EventTime — accepts:
 *   - `2020-05-22` (all-day)
 *   - `2020-05-22T14:00`, `2020-05-22T14:00:00`, `2020-05-22T14:00:00Z` (timed)
 *   - `2020-5-22` / `2020-05-2` (single-digit components — Google's docs say
 *     padded, but real-world data sometimes isn't)
 * Returns null only if the value has no recognisable date prefix at all.
 * Existed because `splitYmd` is intentionally strict (`^(\d{4})-(\d{2})-(\d{2})$`)
 * for filenames; the sync path can't afford that strictness and the previous
 * fallback to "today" silently mis-filed real events.
 */
function ymdFromEventTime(t: EventTime | null | undefined): { year: string; month: string; day: string } | null {
  if (!t || typeof t.value !== 'string') return null
  const m = t.value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return null
  return {
    year: m[1],
    month: m[2].padStart(2, '0'),
    day: m[3].padStart(2, '0')
  }
}

function firstOccurrenceDate(input: { start: EventTime }): { year: string; month: string; day: string } {
  const parsed = ymdFromEventTime(input.start)
  if (parsed) return parsed
  // Truly malformed input — fall back to today rather than throw. We log so
  // the sync path can be diagnosed instead of silently mis-filing.
  // eslint-disable-next-line no-console
  console.warn('[calendar] firstOccurrenceDate fallback to today; start was', JSON.stringify(input.start))
  const now = new Date()
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    day: String(now.getDate()).padStart(2, '0')
  }
}

export async function createEvent(input: CreateEventInput): Promise<CalendarEvent> {
  if (!input.summary?.trim()) throw new Error('Event summary is required')
  if (!input.start || !input.end) throw new Error('Event start and end are required')
  const date = firstOccurrenceDate(input)
  const slug = await pickFreeSlug(date, input.summary)
  const ref: EventRef = { date: `${date.year}-${date.month}-${date.day}`, slug }
  const parsed: ParsedEvent = {
    ...emptyParsedEvent(),
    summary: input.summary,
    description: input.description ?? '',
    status: input.status ?? 'confirmed',
    location: input.location ?? null,
    start: input.start,
    end: input.end,
    attendees: input.attendees ?? [],
    recurrence: input.recurrence ?? [],
    googleCalendarId: input.calendarId ?? null,
    sections: input.description ? { Description: input.description } : {}
  }
  return writeEventRaw(ref, parsed)
}

export async function updateEvent(ref: EventRef, patch: UpdateEventPatch): Promise<CalendarEvent | null> {
  const current = await readEvent(ref)
  if (!current) return null
  const merged: CalendarEvent = {
    ...current,
    summary: patch.summary ?? current.summary,
    description: patch.description ?? current.description,
    status: patch.status ?? current.status,
    location: patch.location === undefined ? current.location : patch.location,
    start: patch.start ?? current.start,
    end: patch.end ?? current.end,
    attendees: patch.attendees ?? current.attendees,
    recurrence: patch.recurrence ?? current.recurrence
  }
  return writeEventRaw(ref, parsedFromEvent(merged))
}

/** Write a fully-formed event back to disk (sync engine path). */
export async function writeEvent(event: CalendarEvent): Promise<CalendarEvent> {
  return writeEventRaw(event.ref, parsedFromEvent(event))
}

/**
 * Create or replace an event from a sync engine.
 *
 * Correctness rule: the file is filed at the calendar date the event's start
 * actually falls on. If we find a stale file with the matching google-id at
 * a DIFFERENT date (e.g. from an earlier pull that fell back to today before
 * the parser was made permissive), we relocate it. If we find duplicates,
 * we keep the one at the correct date and delete the rest. This guarantees
 * that repeated pulls converge on the right location instead of pinning the
 * event to wherever the first (possibly wrong) pull landed.
 */
export async function upsertEventFromSync(input: {
  summary: string
  start: EventTime
  end: EventTime
  description?: string
  location?: string | null
  status?: 'confirmed' | 'tentative' | 'cancelled'
  attendees?: CalendarEvent['attendees']
  recurrence?: string[]
  googleId: string
  googleCalendarId: string
  recurringMasterId?: string | null
  originalStart?: EventTime | null
}): Promise<CalendarEvent> {
  const correctDate = firstOccurrenceDate(input)
  const correctDateStr = `${correctDate.year}-${correctDate.month}-${correctDate.day}`
  console.warn(
    `[calendar] upsertEventFromSync googleId=${input.googleId} start=${input.start?.value ?? '?'} → date=${correctDateStr}`
  )

  // Collect every prior file we already have for this google-id. There may
  // be more than one if an earlier sync filed them at the wrong date.
  const allExisting = await findAllEventsByGoogleId(input.googleId)
  let keeper: CalendarEvent | null = null
  for (const candidate of allExisting) {
    if (candidate.ref.date === correctDateStr && !keeper) {
      keeper = candidate
      continue
    }
    // Either it's at the wrong date, or it's a duplicate at the correct date.
    // Either way, delete it — the canonical row is the keeper (or a fresh one
    // we'll create below).
    console.warn(
      `[calendar] deleting stale event ${input.googleId} at ${candidate.ref.date}/${candidate.ref.slug} (correct date is ${correctDateStr})`
    )
    await deleteEvent(candidate.ref)
  }

  const ref: EventRef = keeper
    ? keeper.ref
    : { date: correctDateStr, slug: await pickFreeSlug(correctDate, input.summary) }
  const merged: CalendarEvent = {
    ref,
    path: pathForRef(ref)!,
    summary: input.summary,
    description: input.description ?? '',
    status: input.status ?? 'confirmed',
    location: input.location ?? null,
    start: input.start,
    end: input.end,
    attendees: input.attendees ?? [],
    recurrence: input.recurrence ?? [],
    googleId: input.googleId,
    googleCalendarId: input.googleCalendarId,
    recurringMasterId: input.recurringMasterId ?? null,
    originalStart: input.originalStart ?? null
  }
  return writeEvent(merged)
}
