// rose-calendar — third built-in extension (after rose-contacts, rose-email).
//
// Calendar events live agent-global at
//   ~/.rose/calendar/{yyyy}/{mm}/{dd}/{slug}.md
// See ADR 0012 for the recurring-event master + RRULE expansion model and
// ADR 0019 for the retirement of the "Memory" umbrella that Events used to
// belong to.

export { manifest } from './manifest'
export { CalendarPage as PageView } from './CalendarPage'
export { CalendarSettings as SettingsView } from './CalendarSettings'
