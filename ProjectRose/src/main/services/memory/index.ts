// Memory subsystem entry point. The host calls initMemorySubsystem() once on
// app ready (see src/main/index.ts) to start the daily diary scheduler and
// the every-30-minute contacts updater. Path scaffold (~/.rose/memory/...)
// is handled in ensureAgentHome() at agent-home init time.

import { startDiaryScheduler } from './diaryScheduler'
import { startContactsUpdater } from './contactsUpdater'

export function initMemorySubsystem(): void {
  startDiaryScheduler()
  startContactsUpdater()
}

export { stopDiaryScheduler, runDiaryNow, regenerateTodayDiary, getScheduleStatus } from './diaryScheduler'
export {
  stopContactsUpdater,
  runContactsUpdaterNow,
  getContactsUpdaterStatus,
  CONTACTS_UPDATER_INTERVAL_MINUTES
} from './contactsUpdater'
export * from './diary'
export * from './behaviorRecords'
export * from './contacts'
export * from './conversationLog'
export * from './agentActivity'
export {
  googleGetStatus,
  googleSaveCredentials,
  googleClearCredentials,
  googleSignIn,
  googleSignOut,
  googlePreviewPull,
  googleApplyPull,
  googlePreviewPush,
  googleApplyPush
} from './googleContacts'
export {
  createEvent,
  updateEvent,
  deleteEvent,
  readEvent,
  listEventsForRange,
  findEventByGoogleId,
  listAllEvents
} from './calendar'
export {
  googleCalendarGetStatus,
  googleCalendarListCalendars,
  googleCalendarPreviewPull,
  googleCalendarApplyPull,
  googleCalendarPreviewPush,
  googleCalendarApplyPush,
  googleCalendarSendInvite
} from './googleCalendar'
export { inviteAttendeesToEvent } from './calendarInvite'
