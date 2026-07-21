import { join } from 'path'
import { agentCalendarDir } from '../../lib/agentHome'

// Event files live under ~/.rose/calendar/{yyyy}/{mm}/{dd}/{slug}.md —
// agent-global, like the rest of ~/.rose/ (see ADR 0019 for the move out of
// the retired ~/.rose/memory/ tree).

export function calendarYearDir(year: string): string {
  return join(agentCalendarDir(), year)
}

export function calendarMonthDir(year: string, month: string): string {
  return join(agentCalendarDir(), year, month)
}

export function calendarDayDir(year: string, month: string, day: string): string {
  return join(agentCalendarDir(), year, month, day)
}

export function calendarEventPath(date: { year: string; month: string; day: string }, slug: string): string {
  return join(agentCalendarDir(), date.year, date.month, date.day, `${slug}.md`)
}

export function splitYmd(key: string): { year: string; month: string; day: string } | null {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return { year: m[1], month: m[2], day: m[3] }
}

// Filenames have to survive a round-trip through both Windows and POSIX
// filesystems. Strip the obvious illegals and collapse whitespace runs into
// dashes. Empty inputs become 'untitled' so we never emit '.md'.
export function slugifyForFilename(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return cleaned || 'untitled'
}
