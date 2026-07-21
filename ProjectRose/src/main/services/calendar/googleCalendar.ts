// Google Calendar sync engine — mirrors the rose-contacts googleContacts.ts
// shape end-to-end. Each direction is a two-step preview/apply so the
// renderer can show a dry-run confirm modal before any write happens.
//
// The reconciliation anchor is the event's `iCalUID` (stored locally as the
// `google-id` bullet). Recurring masters round-trip with their `recurrence`
// rules intact; Google's per-instance exceptions are mirrored as their own
// files linked back to the master via `recurring-master-id`.

import log from 'electron-log/main'
import { google, type calendar_v3 } from 'googleapis'
import { type OAuth2Client } from 'google-auth-library'

import { applySettingsPatch, readSettings } from '../settingsService'
import {
  buildAuthedClient,
  googleAuthClearCredentials,
  googleAuthGetStatus,
  googleAuthSaveCredentials,
  googleAuthSignIn,
  googleAuthSignOut
} from '../google/googleAuth'
import type {
  CalendarEvent,
  EventAttendee,
  EventTime,
  GoogleApplyResult,
  GoogleCalendarPullEntry,
  GoogleCalendarPullPlan,
  GoogleCalendarPushEntry,
  GoogleCalendarPushPlan,
  GoogleCalendarPushUpdate,
  GoogleCalendarRow,
  GoogleCalendarSyncSettings,
  GoogleCalendarSyncStatus
} from '../../../shared/calendar'
import { listAllEvents, upsertEventFromSync } from './calendar'

// ── Settings helpers ─────────────────────────────────────────────────────

async function readCalendarSyncSettings(): Promise<GoogleCalendarSyncSettings> {
  const settings = await readSettings()
  const block = settings.calendar?.googleSync
  return {
    lastPullAt: block?.lastPullAt ?? null,
    lastPushAt: block?.lastPushAt ?? null,
    syncCalendars: block?.syncCalendars ?? { primary: true }
  }
}

async function patchCalendarSyncSettings(patch: Partial<GoogleCalendarSyncSettings>): Promise<void> {
  const settings = await readSettings()
  const existing = settings.calendar?.googleSync ?? { lastPullAt: null, lastPushAt: null, syncCalendars: { primary: true } }
  await applySettingsPatch({
    calendar: {
      ...settings.calendar,
      googleSync: { ...existing, ...patch }
    }
  })
}

// ── Status / sign-in / sign-out ─────────────────────────────────────────

async function listAccountCalendars(client: OAuth2Client): Promise<GoogleCalendarRow[]> {
  const cal = google.calendar({ version: 'v3', auth: client })
  const out: GoogleCalendarRow[] = []
  let pageToken: string | undefined
  do {
    const res = await cal.calendarList.list({ pageToken, maxResults: 250 })
    for (const item of res.data.items ?? []) {
      if (!item.id) continue
      out.push({
        id: item.id,
        summary: item.summaryOverride ?? item.summary ?? item.id,
        primary: item.primary === true,
        accessRole: item.accessRole ?? null,
        backgroundColor: item.backgroundColor ?? null
      })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

export async function googleCalendarGetStatus(): Promise<GoogleCalendarSyncStatus> {
  const auth = await googleAuthGetStatus()
  const sync = await readCalendarSyncSettings()
  let calendars: GoogleCalendarRow[] = []
  let scopeGranted = false
  if (auth.signedIn) {
    try {
      const client = await buildAuthedClient()
      if (client) {
        calendars = await listAccountCalendars(client)
        scopeGranted = true
      }
    } catch (err) {
      // Likely missing `calendar` scope — surface as scopeGranted=false so the
      // UI can prompt the user to re-consent.
      scopeGranted = false
      log.warn('[google-calendar] listAccountCalendars failed:', err)
    }
  }
  return {
    credentialsConfigured: auth.credentialsConfigured,
    signedIn: auth.signedIn,
    accountEmail: auth.accountEmail,
    scopeGranted,
    lastPullAt: sync.lastPullAt,
    lastPushAt: sync.lastPushAt,
    calendars
  }
}

export async function googleCalendarSaveCredentials(
  payload: { clientId: string; clientSecret: string }
): Promise<GoogleCalendarSyncStatus> {
  await googleAuthSaveCredentials(payload)
  return googleCalendarGetStatus()
}

export async function googleCalendarClearCredentials(): Promise<GoogleCalendarSyncStatus> {
  await googleAuthClearCredentials()
  return googleCalendarGetStatus()
}

export async function googleCalendarSignIn(): Promise<GoogleCalendarSyncStatus> {
  await googleAuthSignIn()
  return googleCalendarGetStatus()
}

export async function googleCalendarSignOut(): Promise<GoogleCalendarSyncStatus> {
  await googleAuthSignOut()
  return googleCalendarGetStatus()
}

export async function googleCalendarListCalendars(): Promise<GoogleCalendarRow[]> {
  const client = await buildAuthedClient()
  if (!client) throw new Error('Not signed in to Google.')
  return listAccountCalendars(client)
}

// ── Mapping helpers ─────────────────────────────────────────────────────

function googleTimeToEventTime(gt: calendar_v3.Schema$EventDateTime | undefined): EventTime | null {
  if (!gt) return null
  if (gt.date) {
    return { value: gt.date, timeZone: null, allDay: true }
  }
  if (gt.dateTime) {
    // Strip the trailing `Z` or offset since we store wall-clock + timeZone.
    const trimmed = gt.dateTime.replace(/(Z|[+-]\d{2}:\d{2})$/, '').slice(0, 19)
    return { value: trimmed, timeZone: gt.timeZone ?? null, allDay: false }
  }
  return null
}

function eventTimeToGoogleTime(t: EventTime): calendar_v3.Schema$EventDateTime {
  if (t.allDay) return { date: t.value }
  return { dateTime: t.value, timeZone: t.timeZone ?? undefined }
}

function attendeesFromGoogle(google: calendar_v3.Schema$EventAttendee[] | undefined): EventAttendee[] {
  if (!google) return []
  return google.map((a) => ({
    email: a.email ?? '',
    displayName: a.displayName ?? undefined,
    responseStatus: ((a.responseStatus as EventAttendee['responseStatus']) ?? 'needsAction'),
    organizer: a.organizer === true ? true : undefined,
    self: a.self === true ? true : undefined
  })).filter((a) => a.email.length > 0)
}

function attendeesToGoogle(local: EventAttendee[]): calendar_v3.Schema$EventAttendee[] {
  return local.map((a) => ({
    email: a.email,
    displayName: a.displayName,
    responseStatus: a.responseStatus,
    organizer: a.organizer,
    self: a.self
  }))
}

function summariseEventForPreview(event: calendar_v3.Schema$Event): string {
  const summary = event.summary ?? '(no title)'
  const start = event.start?.dateTime ?? event.start?.date ?? '?'
  return `${start} — ${summary}`
}

/**
 * Convert a Google Calendar event into the payload we store on disk. Returns
 * null if the event lacks the bare minimum (id and a usable start/end).
 *
 * This is the SINGLE place start.date / start.dateTime get parsed for sync;
 * previewPull caches the result in the plan entry so applyPull doesn't
 * re-derive it (the old re-fetch path occasionally landed on `[0]` of a
 * multi-item iCalUID response, which could be an instance rather than the
 * master and confused the first-occurrence-date helper).
 */
function normalizeGoogleEvent(
  ge: calendar_v3.Schema$Event,
  calendarId: string
): GoogleCalendarPullEntry['payload'] | null {
  const iCalUID = ge.iCalUID ?? ge.id
  const eventId = ge.id
  if (!iCalUID || !eventId) return null
  const start = googleTimeToEventTime(ge.start ?? undefined)
  const end = googleTimeToEventTime(ge.end ?? undefined) ?? start
  if (!start || !end) return null
  return {
    summary: ge.summary ?? '(no title)',
    start,
    end,
    description: ge.description ?? '',
    location: ge.location ?? null,
    status: ((ge.status as 'confirmed' | 'tentative' | 'cancelled') ?? 'confirmed'),
    attendees: attendeesFromGoogle(ge.attendees ?? undefined),
    recurrence: Array.isArray(ge.recurrence) ? ge.recurrence : [],
    googleId: iCalUID,
    googleCalendarId: calendarId,
    googleEventId: eventId,
    recurringMasterId: typeof ge.recurringEventId === 'string' ? ge.recurringEventId : null,
    originalStart: googleTimeToEventTime(ge.originalStartTime ?? undefined)
  }
}

/**
 * Pick the master event from a `events.list({iCalUID, singleEvents: false})`
 * response. With `singleEvents: false` the response can include the master
 * plus any per-instance exception events; the master is the one without
 * `recurringEventId` set.
 */
function pickMasterEvent(items: calendar_v3.Schema$Event[]): calendar_v3.Schema$Event | null {
  if (items.length === 0) return null
  const master = items.find((i) => !i.recurringEventId)
  return master ?? items[0]
}

async function findMasterEventByICalUID(
  cal: ReturnType<typeof google.calendar>,
  calendarId: string,
  iCalUID: string
): Promise<calendar_v3.Schema$Event | null> {
  const res = await cal.events.list({
    calendarId,
    iCalUID,
    singleEvents: false,
    showDeleted: false,
    maxResults: 25
  })
  return pickMasterEvent(res.data.items ?? [])
}

// ── Pull (Google → local) ───────────────────────────────────────────────

async function listGoogleEvents(client: OAuth2Client, calendarId: string): Promise<calendar_v3.Schema$Event[]> {
  const cal = google.calendar({ version: 'v3', auth: client })
  const out: calendar_v3.Schema$Event[] = []
  let pageToken: string | undefined
  do {
    const res = await cal.events.list({
      calendarId,
      // Master form: do NOT expand recurrences. We mirror Google's structure
      // (masters + per-instance exceptions linked via recurringEventId).
      singleEvents: false,
      showDeleted: false,
      maxResults: 250,
      pageToken
    })
    if (res.data.items) out.push(...res.data.items)
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

function localKey(event: CalendarEvent): string {
  return event.googleId ?? `local:${event.ref.date}/${event.ref.slug}`
}

export async function googleCalendarPreviewPull(): Promise<GoogleCalendarPullPlan> {
  const client = await buildAuthedClient()
  if (!client) throw new Error('Not signed in to Google.')

  const sync = await readCalendarSyncSettings()
  const allCalendars = await listAccountCalendars(client)
  const skippedCalendars: { id: string; summary: string }[] = []
  const enabledCalendars: GoogleCalendarRow[] = []
  for (const cal of allCalendars) {
    if (sync.syncCalendars[cal.id] === false) skippedCalendars.push({ id: cal.id, summary: cal.summary })
    else enabledCalendars.push(cal)
  }

  const local = await listAllEvents()
  const localByGoogleId = new Map(local.filter((e) => e.googleId).map((e) => [e.googleId!, e]))

  let fetched = 0
  const create: GoogleCalendarPullEntry[] = []
  const update: GoogleCalendarPullEntry[] = []
  let unchanged = 0

  for (const cal of enabledCalendars) {
    const events = await listGoogleEvents(client, cal.id)
    fetched += events.length
    for (const ge of events) {
      const payload = normalizeGoogleEvent(ge, cal.id)
      if (!payload) continue
      const entry: GoogleCalendarPullEntry = {
        summary: payload.summary,
        start: ge.start?.dateTime ?? ge.start?.date ?? payload.start.value,
        end: ge.end?.dateTime ?? ge.end?.date ?? payload.end.value,
        googleId: payload.googleId,
        googleCalendarId: cal.id,
        isRecurringMaster: payload.recurrence.length > 0,
        isException: payload.recurringMasterId !== null,
        payload
      }
      const existing = localByGoogleId.get(payload.googleId)
      if (!existing) {
        create.push(entry)
      } else if (existing.summary !== payload.summary || existing.start?.value !== payload.start.value) {
        update.push(entry)
      } else {
        unchanged += 1
      }
    }
  }

  return { fetched, create, update, unchanged, skippedCalendars }
}

export async function googleCalendarApplyPull(plan: GoogleCalendarPullPlan): Promise<GoogleApplyResult> {
  // applyPull intentionally does NOT re-fetch from Google: the preview phase
  // already captured the normalised payload, and rewriting the same data
  // twice was the source of the "lands on today" bug. What the user confirmed
  // in the preview modal is exactly what gets written.
  let createdCount = 0
  let updatedCount = 0
  try {
    const allTouches = [...plan.create, ...plan.update]
    for (const entry of allTouches) {
      const p = entry.payload
      if (!p) continue
      await upsertEventFromSync({
        summary: p.summary,
        start: p.start,
        end: p.end,
        description: p.description,
        location: p.location,
        status: p.status,
        attendees: p.attendees,
        recurrence: p.recurrence,
        googleId: p.googleId,
        googleCalendarId: p.googleCalendarId,
        recurringMasterId: p.recurringMasterId,
        originalStart: p.originalStart
      })
      if (plan.create.includes(entry)) createdCount += 1
      else updatedCount += 1
    }
    const appliedAt = Date.now()
    await patchCalendarSyncSettings({ lastPullAt: appliedAt })
    const total = createdCount + updatedCount
    return {
      appliedAt,
      ok: true,
      message: `Pulled ${total} event${total === 1 ? '' : 's'} (${createdCount} new, ${updatedCount} updated).`
    }
  } catch (err) {
    log.error('[google-calendar] applyPull failed', err)
    return { appliedAt: Date.now(), ok: false, message: errMessage(err) }
  }
}

// ── Push (local → Google) ───────────────────────────────────────────────

export async function googleCalendarPreviewPush(): Promise<GoogleCalendarPushPlan> {
  const client = await buildAuthedClient()
  if (!client) throw new Error('Not signed in to Google.')

  const local = await listAllEvents()
  const create: GoogleCalendarPushEntry[] = []
  const update: GoogleCalendarPushUpdate[] = []
  const skip: { ref: { date: string; slug: string }; reason: string }[] = []

  for (const event of local) {
    if (!event.start || !event.end) {
      skip.push({ ref: event.ref, reason: 'event missing start or end' })
      continue
    }
    if (!event.googleId) {
      create.push({
        ref: event.ref,
        summary: event.summary,
        start: event.start.value,
        end: event.end.value,
        targetCalendarId: event.googleCalendarId ?? 'primary'
      })
      continue
    }
    update.push({
      ref: event.ref,
      googleId: event.googleId,
      googleCalendarId: event.googleCalendarId ?? 'primary',
      summary: event.summary,
      fields: previewFieldList(event)
    })
  }

  return { localCount: local.length, create, update, skip }
}

function previewFieldList(event: CalendarEvent): string[] {
  const out: string[] = [`summary: ${event.summary}`]
  if (event.location) out.push(`location: ${event.location}`)
  if (event.start) out.push(`start: ${event.start.value}`)
  if (event.end) out.push(`end: ${event.end.value}`)
  for (const att of event.attendees) out.push(`attendee: ${att.email} (${att.responseStatus})`)
  for (const rec of event.recurrence) out.push(rec)
  return out
}

export async function googleCalendarApplyPush(plan: GoogleCalendarPushPlan): Promise<GoogleApplyResult> {
  const client = await buildAuthedClient()
  if (!client) return { appliedAt: Date.now(), ok: false, message: 'Not signed in to Google.' }
  const cal = google.calendar({ version: 'v3', auth: client })

  const localAll = await listAllEvents()
  const refKey = (r: { date: string; slug: string }): string => `${r.date}/${r.slug}`
  const localByRef = new Map(localAll.map((e) => [refKey(e.ref), e]))

  let created = 0
  let updated = 0
  try {
    for (const entry of plan.create) {
      const event = localByRef.get(refKey(entry.ref))
      if (!event || !event.start || !event.end) continue
      const res = await cal.events.insert({
        calendarId: entry.targetCalendarId,
        requestBody: {
          summary: event.summary,
          description: event.description,
          location: event.location ?? undefined,
          start: eventTimeToGoogleTime(event.start),
          end: eventTimeToGoogleTime(event.end),
          attendees: event.attendees.length > 0 ? attendeesToGoogle(event.attendees) : undefined,
          recurrence: event.recurrence.length > 0 ? event.recurrence : undefined,
          status: event.status
        },
        sendUpdates: event.attendees.length > 0 ? 'all' : 'none'
      })
      const insertedId = res.data.iCalUID ?? res.data.id
      if (insertedId) {
        // Write the assigned google-id back to the local file so future syncs
        // match this event by ID.
        await upsertEventFromSync({
          summary: event.summary,
          start: event.start,
          end: event.end,
          description: event.description,
          location: event.location,
          status: event.status,
          attendees: event.attendees,
          recurrence: event.recurrence,
          googleId: insertedId,
          googleCalendarId: entry.targetCalendarId,
          recurringMasterId: event.recurringMasterId,
          originalStart: event.originalStart
        })
      }
      created += 1
    }
    for (const entry of plan.update) {
      const event = localByRef.get(refKey(entry.ref))
      if (!event || !event.start || !event.end) continue
      const target = await findMasterEventByICalUID(cal, entry.googleCalendarId, entry.googleId)
      if (!target?.id) continue
      await cal.events.patch({
        calendarId: entry.googleCalendarId,
        eventId: target.id,
        requestBody: {
          summary: event.summary,
          description: event.description,
          location: event.location ?? undefined,
          start: eventTimeToGoogleTime(event.start),
          end: eventTimeToGoogleTime(event.end),
          attendees: event.attendees.length > 0 ? attendeesToGoogle(event.attendees) : undefined,
          recurrence: event.recurrence.length > 0 ? event.recurrence : undefined,
          status: event.status
        },
        sendUpdates: event.attendees.length > 0 ? 'all' : 'none'
      })
      updated += 1
    }
    const appliedAt = Date.now()
    await patchCalendarSyncSettings({ lastPushAt: appliedAt })
    const parts: string[] = []
    if (created) parts.push(`created ${created}`)
    if (updated) parts.push(`updated ${updated}`)
    const summary = parts.length ? parts.join(', ') : 'no changes'
    return { appliedAt, ok: true, message: `Pushed to Google: ${summary}.` }
  } catch (err) {
    log.error('[google-calendar] applyPush failed', err)
    return { appliedAt: Date.now(), ok: false, message: errMessage(err) }
  }
}

// ── Invite (synced events only) ──────────────────────────────────────────

export async function googleCalendarSendInvite(args: {
  googleId: string
  googleCalendarId: string
  additionalAttendees: EventAttendee[]
}): Promise<GoogleApplyResult> {
  const client = await buildAuthedClient()
  if (!client) return { appliedAt: Date.now(), ok: false, message: 'Not signed in to Google.' }
  const cal = google.calendar({ version: 'v3', auth: client })

  try {
    const target = await findMasterEventByICalUID(cal, args.googleCalendarId, args.googleId)
    if (!target?.id) return { appliedAt: Date.now(), ok: false, message: 'Could not find the event on Google.' }

    const existing = target.attendees ?? []
    const existingEmails = new Set(existing.map((a) => (a.email ?? '').toLowerCase()))
    const merged: calendar_v3.Schema$EventAttendee[] = [...existing]
    for (const att of args.additionalAttendees) {
      if (existingEmails.has(att.email.toLowerCase())) continue
      merged.push({ email: att.email, displayName: att.displayName, responseStatus: 'needsAction' })
    }

    await cal.events.patch({
      calendarId: args.googleCalendarId,
      eventId: target.id,
      requestBody: { attendees: merged },
      sendUpdates: 'all'
    })
    return { appliedAt: Date.now(), ok: true, message: `Invited ${args.additionalAttendees.length} attendee(s).` }
  } catch (err) {
    log.error('[google-calendar] sendInvite failed', err)
    return { appliedAt: Date.now(), ok: false, message: errMessage(err) }
  }
}

export async function googleCalendarDeleteRemote(args: {
  googleId: string
  googleCalendarId: string
}): Promise<GoogleApplyResult> {
  const client = await buildAuthedClient()
  if (!client) return { appliedAt: Date.now(), ok: false, message: 'Not signed in to Google.' }
  const cal = google.calendar({ version: 'v3', auth: client })

  try {
    const target = await findMasterEventByICalUID(cal, args.googleCalendarId, args.googleId)
    if (!target?.id) return { appliedAt: Date.now(), ok: true, message: 'No remote event found; skipped.' }
    await cal.events.delete({
      calendarId: args.googleCalendarId,
      eventId: target.id,
      sendUpdates: 'all'
    })
    return { appliedAt: Date.now(), ok: true, message: 'Remote event deleted.' }
  } catch (err) {
    log.error('[google-calendar] delete failed', err)
    return { appliedAt: Date.now(), ok: false, message: errMessage(err) }
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

// Suppress unused-import warning for summariseEventForPreview — retained for
// future preview surface but currently the preview entries carry their own
// formatting. Strip if/when no longer needed.
void summariseEventForPreview
