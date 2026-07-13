import { describe, it, expect } from 'vitest'
import {
  parseRoutineContent,
  buildRoutineMarkdown,
  slugifyRoutineName,
  getRoutinePrompt,
  emptyRoutine
} from '../routineFields'

const FULL = `# Routine: Weekday morning brief
- enabled: true
- recurrence: RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
- fire-time: 09:00
- created: 2026-05-24T11:32:00
- last-fired: 2026-05-23T09:00:14
- tools:
  - email_list_messages
  - memory_list_events

## Prompt
Summarize my unread emails.
`

describe('parseRoutineContent', () => {
  it('parses a full routine file', () => {
    const r = parseRoutineContent(FULL)
    expect(r.name).toBe('Weekday morning brief')
    expect(r.enabled).toBe(true)
    expect(r.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'])
    expect(r.fireTime).toBe('09:00')
    expect(r.createdAt).toBe('2026-05-24T11:32:00')
    expect(r.lastFiredAt).toBe('2026-05-23T09:00:14')
    expect(r.tools).toEqual(['email_list_messages', 'memory_list_events'])
    expect(getRoutinePrompt(r)).toBe('Summarize my unread emails.')
  })

  it('accepts inline comma-separated tools', () => {
    const r = parseRoutineContent('# Routine: X\n- tools: a, b ,c\n')
    expect(r.tools).toEqual(['a', 'b', 'c'])
  })

  it('normalises a bare recurrence value to an RRULE: prefix and supports the rrule alias', () => {
    const r = parseRoutineContent('# Routine: X\n- rrule: FREQ=DAILY\n')
    expect(r.recurrence).toEqual(['RRULE:FREQ=DAILY'])
  })

  it('treats yes/1 as true and anything else as false', () => {
    expect(parseRoutineContent('# Routine: X\n- enabled: yes\n').enabled).toBe(true)
    expect(parseRoutineContent('# Routine: X\n- enabled: 1\n').enabled).toBe(true)
    expect(parseRoutineContent('# Routine: X\n- enabled: nope\n').enabled).toBe(false)
  })

  it('preserves unrecognised bullets as extraBullets', () => {
    const r = parseRoutineContent('# Routine: X\n- enabled: true\n- mystery: 42\n')
    expect(r.extraBullets).toEqual(['mystery: 42'])
  })

  it('collects non-Prompt sections too', () => {
    const r = parseRoutineContent('# Routine: X\n\n## Prompt\nP\n\n## Notes\nN\n')
    expect(r.sections.Prompt).toBe('P')
    expect(r.sections.Notes).toBe('N')
  })
})

describe('buildRoutineMarkdown round-trip', () => {
  it('parse → build → parse is stable', () => {
    const a = parseRoutineContent(FULL)
    const b = parseRoutineContent(buildRoutineMarkdown(a))
    expect(b).toEqual(a)
  })

  it('emits Prompt section before other sections', () => {
    const r = emptyRoutine()
    r.name = 'X'
    r.sections = { Notes: 'N', Prompt: 'P' }
    const md = buildRoutineMarkdown(r)
    expect(md.indexOf('## Prompt')).toBeLessThan(md.indexOf('## Notes'))
  })

  it('round-trips an unknown bullet', () => {
    const r = parseRoutineContent('# Routine: X\n- enabled: true\n- mystery: 42\n')
    expect(buildRoutineMarkdown(r)).toContain('- mystery: 42')
  })
})

describe('slugifyRoutineName', () => {
  it('kebab-cases and falls back to "routine"', () => {
    expect(slugifyRoutineName('Weekday Morning Brief!')).toBe('weekday-morning-brief')
    expect(slugifyRoutineName('')).toBe('routine')
  })
})
