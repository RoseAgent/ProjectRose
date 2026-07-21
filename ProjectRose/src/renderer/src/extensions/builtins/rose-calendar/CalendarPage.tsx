import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CalendarEvent,
  EventAttendee,
  EventRef,
  EventTime,
  ResolvedEventOccurrence
} from '@shared/calendar'
import { logInteraction } from '../../../lib/interactionLog'
import styles from './CalendarPage.module.css'

// ── Time helpers ─────────────────────────────────────────────────────────

function pad2(n: number): string { return String(n).padStart(2, '0') }

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

function startOfGrid(d: Date): Date {
  const first = startOfMonth(d)
  const grid = new Date(first)
  grid.setDate(first.getDate() - first.getDay())
  return grid
}

function endOfGrid(start: Date): Date {
  const end = new Date(start)
  end.setDate(start.getDate() + 42)
  return end
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1, 0, 0, 0, 0)
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function localIso(d: Date, allDay: boolean): string {
  if (allDay) return ymdLocal(d)
  return `${ymdLocal(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// Parse an ISO date or date-time as a local-time clock value (no UTC shift).
function parseAsLocal(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return new Date(value)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? '0'))
}

function buildIsoLocal(date: string, time: string): string {
  if (!time) return date
  return `${date}T${time}`
}

interface EditorState {
  ref: EventRef | null
  summary: string
  description: string
  location: string
  allDay: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  timeZone: string
  attendees: EventAttendee[]
  recurrence: string
  googleId: string | null
  googleCalendarId: string | null
}

function defaultEditorState(focused: Date): EditorState {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const oneHourFromNow = new Date(focused)
  oneHourFromNow.setMinutes(0, 0, 0)
  const now = new Date()
  if (focused.toDateString() === now.toDateString()) {
    oneHourFromNow.setHours(now.getHours() + 1)
  } else {
    oneHourFromNow.setHours(9)
  }
  const end = new Date(oneHourFromNow)
  end.setHours(end.getHours() + 1)
  return {
    ref: null,
    summary: '',
    description: '',
    location: '',
    allDay: false,
    startDate: ymdLocal(oneHourFromNow),
    startTime: `${pad2(oneHourFromNow.getHours())}:${pad2(oneHourFromNow.getMinutes())}`,
    endDate: ymdLocal(end),
    endTime: `${pad2(end.getHours())}:${pad2(end.getMinutes())}`,
    timeZone: tz,
    attendees: [],
    recurrence: '',
    googleId: null,
    googleCalendarId: null
  }
}

function editorFromEvent(event: CalendarEvent, occurrenceStart: EventTime, occurrenceEnd: EventTime): EditorState {
  const tz = event.start?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
  const s = parseAsLocal(occurrenceStart.value)
  const e = parseAsLocal(occurrenceEnd.value)
  const allDay = occurrenceStart.allDay
  return {
    ref: event.ref,
    summary: event.summary,
    description: event.description,
    location: event.location ?? '',
    allDay,
    startDate: ymdLocal(s),
    startTime: allDay ? '' : `${pad2(s.getHours())}:${pad2(s.getMinutes())}`,
    endDate: ymdLocal(e),
    endTime: allDay ? '' : `${pad2(e.getHours())}:${pad2(e.getMinutes())}`,
    timeZone: tz,
    attendees: [...event.attendees],
    recurrence: event.recurrence.join('\n'),
    googleId: event.googleId,
    googleCalendarId: event.googleCalendarId
  }
}

function editorToInput(state: EditorState): { start: EventTime; end: EventTime } {
  if (state.allDay) {
    return {
      start: { value: state.startDate, timeZone: null, allDay: true },
      end: { value: state.endDate || state.startDate, timeZone: null, allDay: true }
    }
  }
  return {
    start: { value: buildIsoLocal(state.startDate, state.startTime), timeZone: state.timeZone || null, allDay: false },
    end: { value: buildIsoLocal(state.endDate || state.startDate, state.endTime || state.startTime), timeZone: state.timeZone || null, allDay: false }
  }
}

// ── Page component ──────────────────────────────────────────────────────

export function CalendarPage(): JSX.Element {
  const [focusedMonth, setFocusedMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [occurrences, setOccurrences] = useState<ResolvedEventOccurrence[]>([])
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const gridStart = useMemo(() => startOfGrid(focusedMonth), [focusedMonth])
  const gridEnd = useMemo(() => endOfGrid(gridStart), [gridStart])

  const refresh = useCallback(async () => {
    try {
      const list = await window.api.events.listEvents({
        start: gridStart.toISOString(),
        end: gridEnd.toISOString()
      })
      setOccurrences(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events.')
    }
  }, [gridStart, gridEnd])

  useEffect(() => { void refresh() }, [refresh])

  const days = useMemo(() => {
    const out: Date[] = []
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      out.push(d)
    }
    return out
  }, [gridStart])

  const occurrencesByDay = useMemo(() => {
    const map = new Map<string, ResolvedEventOccurrence[]>()
    for (const occ of occurrences) {
      const startDate = parseAsLocal(occ.start.value)
      const key = ymdLocal(startDate)
      const arr = map.get(key) ?? []
      arr.push(occ)
      map.set(key, arr)
    }
    return map
  }, [occurrences])

  const openNew = (date: Date): void => {
    setEditor(defaultEditorState(date))
    setError(null)
  }

  const openExisting = (occ: ResolvedEventOccurrence): void => {
    setEditor(editorFromEvent(occ.master, occ.start, occ.end))
    setError(null)
  }

  const closeEditor = (): void => {
    setEditor(null)
    setError(null)
  }

  const save = async (): Promise<void> => {
    if (!editor) return
    if (!editor.summary.trim()) { setError('Summary is required.'); return }
    setBusy('Saving…')
    setError(null)
    try {
      const { start, end } = editorToInput(editor)
      const recurrence = editor.recurrence
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean)
      const attendees = editor.attendees.filter((a) => a.email.trim().length > 0)
      if (editor.ref) {
        await window.api.events.updateEvent({
          ref: editor.ref,
          patch: {
            summary: editor.summary,
            description: editor.description,
            location: editor.location || null,
            start,
            end,
            attendees,
            recurrence
          }
        })
        logInteraction('calendar.event-edited')
      } else {
        await window.api.events.createEvent({
          summary: editor.summary,
          start,
          end,
          description: editor.description || undefined,
          location: editor.location || undefined,
          attendees,
          recurrence
        })
        logInteraction('calendar.event-created')
      }
      closeEditor()
      void refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally { setBusy(null) }
  }

  const remove = async (): Promise<void> => {
    if (!editor?.ref) return
    setBusy('Deleting…')
    setError(null)
    try {
      await window.api.events.deleteEvent(editor.ref)
      logInteraction('calendar.event-deleted')
      closeEditor()
      void refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally { setBusy(null) }
  }

  const today = new Date()
  const todayKey = ymdLocal(today)

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button className={styles.btn} onClick={() => setFocusedMonth(addMonths(focusedMonth, -1))}>‹</button>
          <span className={styles.monthLabel}>{monthLabel(focusedMonth)}</span>
          <button className={styles.btn} onClick={() => setFocusedMonth(addMonths(focusedMonth, 1))}>›</button>
          <button className={styles.btn} onClick={() => setFocusedMonth(startOfMonth(new Date()))}>Today</button>
        </div>
        <div className={styles.toolbarRight}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => openNew(new Date())}
          >
            New event
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.grid}>
        {WEEKDAYS.map((w) => (
          <div key={w} className={styles.weekdayHeader}>{w}</div>
        ))}
        {days.map((d, idx) => {
          const key = ymdLocal(d)
          const dayOccurrences = occurrencesByDay.get(key) ?? []
          const isCurrentMonth = d.getMonth() === focusedMonth.getMonth()
          const classes = [styles.dayCell]
          if (!isCurrentMonth) classes.push(styles.dayCellOther)
          if (key === todayKey) classes.push(styles.dayCellToday)
          return (
            <div
              key={`${key}-${idx}`}
              className={classes.join(' ')}
              onDoubleClick={(e) => { e.stopPropagation(); openNew(d) }}
            >
              <span className={styles.dayNumber}>{d.getDate()}</span>
              {dayOccurrences.slice(0, 3).map((occ, i) => {
                const pillClasses = [styles.eventPill]
                if (occ.isRecurringInstance) pillClasses.push(styles.eventPillRecurring)
                const time = occ.start.allDay ? 'all-day' : occ.start.value.slice(11, 16)
                return (
                  <button
                    key={`${occ.master.ref.date}-${occ.master.ref.slug}-${i}`}
                    className={pillClasses.join(' ')}
                    onClick={() => openExisting(occ)}
                    title={`${time} ${occ.master.summary}`}
                  >
                    {time} {occ.master.summary}
                  </button>
                )
              })}
              {dayOccurrences.length > 3 && (
                <span className={styles.moreLink}>+{dayOccurrences.length - 3} more</span>
              )}
            </div>
          )
        })}
      </div>

      {editor && (
        <EventEditor
          state={editor}
          busy={busy}
          onChange={setEditor}
          onCancel={closeEditor}
          onSave={save}
          onDelete={remove}
        />
      )}
    </div>
  )
}

// ── Editor drawer ───────────────────────────────────────────────────────

function EventEditor({
  state,
  busy,
  onChange,
  onCancel,
  onSave,
  onDelete
}: {
  state: EditorState
  busy: string | null
  onChange: (next: EditorState) => void
  onCancel: () => void
  onSave: () => void
  onDelete: () => void
}): JSX.Element {
  const isExisting = state.ref !== null
  const isSynced = state.googleId !== null

  const updateAttendee = (idx: number, email: string): void => {
    const next = [...state.attendees]
    next[idx] = { ...next[idx], email }
    onChange({ ...state, attendees: next })
  }

  const removeAttendee = (idx: number): void => {
    onChange({ ...state, attendees: state.attendees.filter((_, i) => i !== idx) })
  }

  const addAttendee = (): void => {
    onChange({ ...state, attendees: [...state.attendees, { email: '', responseStatus: 'needsAction' }] })
  }

  return (
    <div className={styles.drawerScrim} onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.drawer}>
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>{isExisting ? 'Edit event' : 'New event'}</span>
          <span className={isSynced ? styles.syncBadge : `${styles.syncBadge} ${styles.unsynced}`}>
            {isSynced ? 'synced' : 'local only'}
          </span>
        </div>
        <div className={styles.drawerBody}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Summary</span>
            <input
              className={styles.input}
              value={state.summary}
              onChange={(e) => onChange({ ...state, summary: e.target.value })}
              placeholder="Event title"
            />
          </div>

          <div className={styles.allDayRow}>
            <input
              id="rose-cal-allday"
              type="checkbox"
              checked={state.allDay}
              onChange={(e) => onChange({ ...state, allDay: e.target.checked })}
            />
            <label htmlFor="rose-cal-allday">All-day event</label>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Start date</span>
              <input
                className={styles.input}
                type="date"
                value={state.startDate}
                onChange={(e) => onChange({ ...state, startDate: e.target.value })}
              />
            </div>
            {!state.allDay && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Start time</span>
                <input
                  className={styles.input}
                  type="time"
                  value={state.startTime}
                  onChange={(e) => onChange({ ...state, startTime: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>End date</span>
              <input
                className={styles.input}
                type="date"
                value={state.endDate}
                onChange={(e) => onChange({ ...state, endDate: e.target.value })}
              />
            </div>
            {!state.allDay && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>End time</span>
                <input
                  className={styles.input}
                  type="time"
                  value={state.endTime}
                  onChange={(e) => onChange({ ...state, endTime: e.target.value })}
                />
              </div>
            )}
          </div>

          {!state.allDay && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Time zone</span>
              <input
                className={styles.input}
                value={state.timeZone}
                onChange={(e) => onChange({ ...state, timeZone: e.target.value })}
                placeholder="America/New_York"
              />
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Location</span>
            <input
              className={styles.input}
              value={state.location}
              onChange={(e) => onChange({ ...state, location: e.target.value })}
              placeholder="Where (URL or address)"
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Attendees</span>
            {state.attendees.map((att, idx) => (
              <div key={idx} className={styles.attendeeRow}>
                <input
                  className={styles.input}
                  value={att.email}
                  onChange={(e) => updateAttendee(idx, e.target.value)}
                  placeholder="attendee@example.com"
                />
                <button className={styles.removeBtn} onClick={() => removeAttendee(idx)}>×</button>
              </div>
            ))}
            <button className={styles.addLink} onClick={addAttendee}>+ Add attendee</button>
            {!isSynced && state.attendees.length > 0 && (
              <div className={styles.hint}>
                This event isn't synced to Google yet. Push it from Settings → Calendar → Push to Google, then invitations can be sent.
              </div>
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Recurrence (RRULE per line)</span>
            <textarea
              className={styles.textarea}
              value={state.recurrence}
              onChange={(e) => onChange({ ...state, recurrence: e.target.value })}
              placeholder="RRULE:FREQ=WEEKLY;BYDAY=TU"
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Description</span>
            <textarea
              className={styles.textarea}
              value={state.description}
              onChange={(e) => onChange({ ...state, description: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.drawerFooter}>
          <div>
            {isExisting && (
              <button className={`${styles.btn} ${styles.btnDanger}`} onClick={onDelete} disabled={busy !== null}>Delete</button>
            )}
          </div>
          <div className={styles.footerBtnRow}>
            <button className={styles.btn} onClick={onCancel} disabled={busy !== null}>Cancel</button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onSave} disabled={busy !== null}>
              {busy ?? (isExisting ? 'Save' : 'Create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
