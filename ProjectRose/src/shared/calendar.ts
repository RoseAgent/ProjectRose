// Types for Events — the Agent's agent-global calendar, one markdown file per
// event at `~/.rose/calendar/{yyyy}/{mm}/{dd}/`.
//
// Recurring events store the master at its first-occurrence date with an
// RRULE bullet; the runtime expands occurrences on demand via the `rrule`
// library. Optional Google Calendar sync mirrors the rose-contacts pattern
// (preview/apply pull + push) and reuses the shared Google OAuth client.
// Events are agent-global, like Contacts. Formerly part of the retired
// host-memory subsystem (ADR 0019); Events survive as a standalone concept.

export type { GoogleApplyResult } from './googleSync'

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled'

export type AttendeeResponseStatus =
  | 'needsAction'
  | 'declined'
  | 'tentative'
  | 'accepted'

export interface EventAttendee {
  email: string
  displayName?: string
  responseStatus: AttendeeResponseStatus
  organizer?: boolean
  self?: boolean
}

export interface EventTime {
  value: string
  timeZone: string | null
  allDay: boolean
}

/** A reference to an event file on disk. */
export interface EventRef {
  /** yyyy-mm-dd of the file's parent directory (the event's first-occurrence date). */
  date: string
  /** Filename without the .md extension. */
  slug: string
}

/** A persisted event read from `{date}/{slug}.md`. */
export interface CalendarEvent {
  ref: EventRef
  path: string
  summary: string
  description: string
  status: EventStatus
  location: string | null
  start: EventTime | null
  end: EventTime | null
  attendees: EventAttendee[]
  /** Raw RRULE / RDATE / EXDATE strings as stored on disk. */
  recurrence: string[]
  googleId: string | null
  googleCalendarId: string | null
  recurringMasterId: string | null
  originalStart: EventTime | null
}

/**
 * A single resolved occurrence — either a non-recurring event, one expansion
 * of a recurring master, or an exception event linking back to a master.
 * Times are concrete (allDay flag preserved).
 */
export interface ResolvedEventOccurrence {
  master: CalendarEvent
  start: EventTime
  end: EventTime
  isRecurringInstance: boolean
  isException: boolean
}

export interface CreateEventInput {
  summary: string
  start: EventTime
  end: EventTime
  description?: string
  location?: string
  attendees?: EventAttendee[]
  recurrence?: string[]
  status?: EventStatus
  calendarId?: string
}

export interface UpdateEventPatch {
  summary?: string
  description?: string
  location?: string | null
  status?: EventStatus
  start?: EventTime
  end?: EventTime
  attendees?: EventAttendee[]
  recurrence?: string[]
}

export interface CalendarRangeQuery {
  /** ISO date-time (inclusive lower bound). */
  start: string
  /** ISO date-time (exclusive upper bound). */
  end: string
  /** Optional list of Google calendar IDs to keep. Local-only events are always included. */
  calendarIds?: string[]
}

// ─── Google Calendar sync ────────────────────────────────────────────────

/** Per-calendar settings for sync (one row per Google calendar). */
export interface GoogleCalendarSyncSettings {
  lastPullAt: number | null
  lastPushAt: number | null
  /**
   * Per-Google-calendar opt-in for sync. Keys are Google calendarId strings
   * ('primary', the calendar email address, etc.). New keys default to false
   * except 'primary' which defaults to true.
   */
  syncCalendars: Record<string, boolean>
}

export const DEFAULT_GOOGLE_CALENDAR_SYNC_SETTINGS: GoogleCalendarSyncSettings = {
  lastPullAt: null,
  lastPushAt: null,
  syncCalendars: { primary: true }
}

/** Settings block under AppSettings.calendar. */
export interface CalendarSettings {
  googleSync: GoogleCalendarSyncSettings
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  googleSync: DEFAULT_GOOGLE_CALENDAR_SYNC_SETTINGS
}

export interface GoogleCalendarRow {
  id: string
  summary: string
  primary: boolean
  accessRole: string | null
  backgroundColor: string | null
}

export interface GoogleCalendarSyncStatus {
  credentialsConfigured: boolean
  signedIn: boolean
  accountEmail: string | null
  scopeGranted: boolean
  lastPullAt: number | null
  lastPushAt: number | null
  calendars: GoogleCalendarRow[]
}

export interface GoogleCalendarPullEntry {
  summary: string
  /** Display string for the preview modal — the raw Google start.date / start.dateTime. */
  start: string
  end: string
  googleId: string
  googleCalendarId: string
  isRecurringMaster: boolean
  isException: boolean
  /**
   * Normalised payload populated by `previewPull` and consumed by `applyPull`
   * directly — no second Google API call. Carrying it through the IPC plan
   * makes the apply phase atomic (what the user confirms is what gets
   * written) and removes the iCalUID re-fetch ambiguity (Google's
   * `events.list({iCalUID, singleEvents: false})` can return master +
   * exception items together; picking `[0]` was unsafe).
   */
  payload: {
    summary: string
    start: EventTime
    end: EventTime
    description: string
    location: string | null
    status: EventStatus
    attendees: EventAttendee[]
    recurrence: string[]
    googleId: string
    googleCalendarId: string
    googleEventId: string
    recurringMasterId: string | null
    originalStart: EventTime | null
  }
}

export interface GoogleCalendarPullPlan {
  fetched: number
  create: GoogleCalendarPullEntry[]
  update: GoogleCalendarPullEntry[]
  unchanged: number
  /** Calendars present at the account but currently filtered off via syncCalendars. */
  skippedCalendars: { id: string; summary: string }[]
}

export interface GoogleCalendarPushEntry {
  ref: EventRef
  summary: string
  start: string
  end: string
  targetCalendarId: string
}

export interface GoogleCalendarPushUpdate {
  ref: EventRef
  googleId: string
  googleCalendarId: string
  summary: string
  fields: string[]
}

export interface GoogleCalendarPushPlan {
  localCount: number
  create: GoogleCalendarPushEntry[]
  update: GoogleCalendarPushUpdate[]
  skip: { ref: EventRef; reason: string }[]
}
