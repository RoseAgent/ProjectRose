import { defineIpc, method } from '../../../shared/ipc/defineIpc'
import type {
  CalendarEvent,
  CalendarRangeQuery,
  CreateEventInput,
  EventAttendee,
  EventRef,
  GoogleApplyResult,
  GoogleCalendarPullPlan,
  GoogleCalendarPushPlan,
  GoogleCalendarRow,
  GoogleCalendarSyncStatus,
  ResolvedEventOccurrence,
  UpdateEventPatch
} from '../../../shared/calendar'

// IPC manifest for Events (~/.rose/calendar/) — local CRUD + Google Calendar
// sync (see ADR 0012). Bound flat on window.api.events.* — see
// src/preload/index.ts.

export const eventsIpc = defineIpc('events', {
  listEvents: method<[range: CalendarRangeQuery], ResolvedEventOccurrence[]>(),
  getEvent: method<[ref: EventRef], CalendarEvent | null>(),
  createEvent: method<[input: CreateEventInput], CalendarEvent>(),
  updateEvent: method<[payload: { ref: EventRef; patch: UpdateEventPatch }], CalendarEvent | null>(),
  deleteEvent: method<[ref: EventRef], void>(),
  inviteToEvent: method<[payload: { ref: EventRef; attendees: EventAttendee[] }], GoogleApplyResult>(),
  googleCalendarGetStatus: method<[], GoogleCalendarSyncStatus>(),
  googleCalendarListCalendars: method<[], GoogleCalendarRow[]>(),
  googleCalendarPreviewPull: method<[], GoogleCalendarPullPlan>(),
  googleCalendarApplyPull: method<[plan: GoogleCalendarPullPlan], GoogleApplyResult>(),
  googleCalendarPreviewPush: method<[], GoogleCalendarPushPlan>(),
  googleCalendarApplyPush: method<[plan: GoogleCalendarPushPlan], GoogleApplyResult>()
})
