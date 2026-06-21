// Single source of truth for "invite attendees to a synced event": read the
// event, verify it is Google-synced, ask Google to send the native invitations,
// and reflect the new attendees in the local file on success. Both the agent
// tool (memory_invite_to_event) and the renderer IPC handler (inviteToEvent)
// drive this — they differ only in how they present the outcome, so the
// sequence lives here and the discriminated result lets each caller format its
// own messages without re-implementing the steps.
import { readEvent, updateEvent } from './calendar'
import { googleCalendarSendInvite } from './googleCalendar'
import type { EventAttendee, EventRef } from '../../../shared/memory'
import type { GoogleApplyResult } from '../../../shared/memory'

export type EventInviteOutcome =
  | { status: 'no-event' }
  | { status: 'not-synced' }
  // Google's send call returned — `result.ok` distinguishes success (local
  // attendees already merged) from a send failure. Carries the raw result so
  // callers can surface Google's message.
  | { status: 'sent'; result: GoogleApplyResult }

export async function inviteAttendeesToEvent(
  ref: EventRef,
  attendees: EventAttendee[]
): Promise<EventInviteOutcome> {
  const event = await readEvent(ref)
  if (!event) return { status: 'no-event' }
  if (!event.googleId || !event.googleCalendarId) return { status: 'not-synced' }

  const result = await googleCalendarSendInvite({
    googleId: event.googleId,
    googleCalendarId: event.googleCalendarId,
    additionalAttendees: attendees
  })

  if (result.ok) {
    // Reflect the new attendees locally so subsequent reads show them.
    const existingEmails = new Set(event.attendees.map((a) => a.email.toLowerCase()))
    const merged: EventAttendee[] = [...event.attendees]
    for (const att of attendees) {
      if (!existingEmails.has(att.email.toLowerCase())) merged.push(att)
    }
    await updateEvent(ref, { attendees: merged })
  }

  return { status: 'sent', result }
}
