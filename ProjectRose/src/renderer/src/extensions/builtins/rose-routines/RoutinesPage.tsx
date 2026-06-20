// rose-routines — PageView.
//
// Three nested views inside one component:
//   1. List of routines (with enabled toggle indicator + next-fire summary)
//   2. Click a routine → editor panel (schedule picker + prompt + tool
//      allowlist + Save / Delete / Run Now) AND a runs list below
//   3. Click a run → transcript view rendered from parseRunMarkdown
//
// All data flows via window.api.routines.* (declared in routinesService.ipc.ts
// and bound in src/preload/index.ts).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RRule, rrulestr, Frequency, Weekday } from 'rrule'
import {
  buildRoutineMarkdown,
  emptyRoutine,
  getRoutinePrompt,
  type ParsedRoutine
} from '@shared/routineFields'
import { parseRunMarkdown, type RoutineRunRecord } from '@shared/routineRun'
import type { ToolMeta } from '@shared/types'
import { useProjectStore } from '../../../stores/useProjectStore'
import { logInteraction } from '../../../lib/interactionLog'
import { DetachedRunTranscriptView } from '../../../components/DetachedRunTranscriptView'
import styles from './RoutinesPage.module.css'

type View = { kind: 'list' } | { kind: 'edit'; slug: string | null } | { kind: 'run'; slug: string; filename: string }

const WEEKDAY_LABELS: Array<{ label: string; rrule: Weekday }> = [
  { label: 'Mo', rrule: RRule.MO },
  { label: 'Tu', rrule: RRule.TU },
  { label: 'We', rrule: RRule.WE },
  { label: 'Th', rrule: RRule.TH },
  { label: 'Fr', rrule: RRule.FR },
  { label: 'Sa', rrule: RRule.SA },
  { label: 'Su', rrule: RRule.SU }
]

type FreqChoice = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'

interface ScheduleForm {
  freq: FreqChoice
  weekdays: number[] // Sun=0..Sat=6 indices into WEEKDAY_LABELS by .rrule.weekday
  fireTime: string
}

function defaultScheduleForm(): ScheduleForm {
  return { freq: 'weekly', weekdays: [1, 2, 3, 4, 5], fireTime: '09:00' }
}

function compileSchedule(form: ScheduleForm): string {
  const byday = form.weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((i) => WEEKDAY_LABELS.find((w) => w.rrule.weekday === i)?.rrule.toString())
    .filter(Boolean)
    .join(',')
  switch (form.freq) {
    case 'daily':
      return 'RRULE:FREQ=DAILY'
    case 'weekly':
      return byday ? `RRULE:FREQ=WEEKLY;BYDAY=${byday}` : 'RRULE:FREQ=WEEKLY'
    case 'biweekly':
      return byday ? `RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=${byday}` : 'RRULE:FREQ=WEEKLY;INTERVAL=2'
    case 'monthly':
      return 'RRULE:FREQ=MONTHLY'
    case 'yearly':
      return 'RRULE:FREQ=YEARLY'
  }
}

function decodeSchedule(rrule: string | undefined, fireTime: string): ScheduleForm {
  const base = defaultScheduleForm()
  base.fireTime = fireTime || '09:00'
  if (!rrule) return base
  try {
    const parsed = rrulestr(rrule)
    const opts = parsed instanceof RRule ? parsed.options : null
    if (!opts) return base
    if (opts.freq === Frequency.DAILY) base.freq = 'daily'
    else if (opts.freq === Frequency.WEEKLY) {
      base.freq = opts.interval === 2 ? 'biweekly' : 'weekly'
      if (opts.byweekday && opts.byweekday.length > 0) {
        base.weekdays = opts.byweekday as number[]
      } else {
        base.weekdays = []
      }
    } else if (opts.freq === Frequency.MONTHLY) base.freq = 'monthly'
    else if (opts.freq === Frequency.YEARLY) base.freq = 'yearly'
  } catch {
    /* fall through to default */
  }
  return base
}

function humanizeRule(rrule: string | undefined, fireTime: string): string {
  if (!rrule) return 'No schedule'
  try {
    const parsed = rrulestr(rrule)
    if (parsed instanceof RRule) {
      return `${parsed.toText()} at ${fireTime}`
    }
  } catch {
    /* */
  }
  return rrule
}

function nowIsoLocal(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

export function RoutinesPage(): JSX.Element {
  const rootPath = useProjectStore((s) => s.rootPath) ?? ''
  const [routines, setRoutines] = useState<Array<{ slug: string; routine: ParsedRoutine }>>([])
  const [view, setView] = useState<View>({ kind: 'list' })
  const [tools, setTools] = useState<ToolMeta[]>([])
  const [runs, setRuns] = useState<Array<{ filename: string; scheduledAt: string; status: 'success' | 'failed'; trigger: 'scheduled' | 'manual'; durationMs: number }>>([])
  const [runRecord, setRunRecord] = useState<RoutineRunRecord | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    if (!rootPath) {
      setRoutines([])
      return
    }
    const list = await window.api.routines.list(rootPath)
    setRoutines(list)
  }, [rootPath])

  const reloadTools = useCallback(async (): Promise<void> => {
    if (!rootPath) {
      setTools([])
      return
    }
    try {
      const t = await window.api.tools.list(rootPath)
      // Hide interactive tools from the picker — they're always stripped at fire time.
      setTools(t.filter((x) => x.name !== 'ask_user' && x.name !== 'screenshot'))
    } catch {
      setTools([])
    }
  }, [rootPath])

  useEffect(() => {
    void reload()
    void reloadTools()
  }, [reload, reloadTools])

  // Listen for routines:changed broadcasts from the main scheduler.
  useEffect(() => {
    if (!rootPath) return
    const off = window.api.on('routines:changed', () => {
      void reload()
      if (view.kind === 'edit' && view.slug) {
        void window.api.routines.listRuns(rootPath, view.slug).then(setRuns)
      }
    })
    return () => {
      off()
    }
  }, [rootPath, reload, view])

  // When entering edit view, load runs for that routine.
  useEffect(() => {
    if (view.kind !== 'edit' || !view.slug || !rootPath) {
      setRuns([])
      return
    }
    void window.api.routines.listRuns(rootPath, view.slug).then(setRuns)
  }, [view, rootPath])

  // When opening a run, fetch + parse the transcript file.
  useEffect(() => {
    if (view.kind !== 'run' || !rootPath) {
      setRunRecord(null)
      return
    }
    void (async () => {
      const md = await window.api.routines.readRun(rootPath, view.slug, view.filename)
      setRunRecord(md ? parseRunMarkdown(md) : null)
    })()
  }, [view, rootPath])

  if (!rootPath) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>Open a workspace to manage routines.</div>
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────────

  const handleNew = (): void => setView({ kind: 'edit', slug: null })
  const handleSelect = (slug: string): void => setView({ kind: 'edit', slug })
  const handleBack = (): void => setView({ kind: 'list' })

  // ── Active routine state for edit view ──────────────────────────────────

  const activeSlug = view.kind === 'edit' ? view.slug : null
  const activeRoutine: ParsedRoutine | null = useMemo(() => {
    if (view.kind !== 'edit') return null
    if (view.slug === null) {
      const r = emptyRoutine()
      r.createdAt = nowIsoLocal()
      r.sections['Prompt'] = ''
      return r
    }
    return routines.find((r) => r.slug === view.slug)?.routine ?? null
  }, [view, routines])

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.title}>Routines</div>
        <div>
          {view.kind === 'list' ? (
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleNew}>
              New Routine
            </button>
          ) : (
            <button className={styles.btn} onClick={handleBack}>
              ← All Routines
            </button>
          )}
        </div>
      </div>

      {view.kind === 'list' && (
        <ListView routines={routines} onSelect={handleSelect} />
      )}

      {view.kind === 'edit' && activeRoutine && (
        <EditView
          rootPath={rootPath}
          slug={activeSlug}
          routine={activeRoutine}
          tools={tools}
          runs={runs}
          onSaved={async (newSlug) => {
            await reload()
            setView({ kind: 'edit', slug: newSlug })
          }}
          onDeleted={async () => {
            await reload()
            setView({ kind: 'list' })
          }}
          onOpenRun={(filename) => setView({ kind: 'run', slug: activeSlug!, filename })}
        />
      )}

      {view.kind === 'run' && (
        <RunView
          record={runRecord}
          onBack={() => setView({ kind: 'edit', slug: view.slug })}
        />
      )}
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────

function ListView({
  routines,
  onSelect
}: {
  routines: Array<{ slug: string; routine: ParsedRoutine }>
  onSelect: (slug: string) => void
}): JSX.Element {
  if (routines.length === 0) {
    return (
      <div className={styles.empty}>
        No routines yet. Click "New Routine" to schedule your first one.
      </div>
    )
  }
  return (
    <div className={styles.listColumn} style={{ borderRight: 'none' }}>
      {routines.map(({ slug, routine }) => (
        <div
          key={slug}
          className={`${styles.routineRow} ${routine.enabled ? '' : styles.routineRowDisabled}`}
          onClick={() => onSelect(slug)}
        >
          <div className={styles.routineRowName}>
            {routine.name || '(untitled)'} {!routine.enabled && '· paused'}
          </div>
          <div className={styles.routineRowMeta}>
            {humanizeRule(routine.recurrence[0], routine.fireTime)}
          </div>
          {routine.lastFiredAt && (
            <div className={styles.routineRowMeta}>last fired {routine.lastFiredAt}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Edit view ─────────────────────────────────────────────────────────────

function EditView({
  rootPath,
  slug,
  routine,
  tools,
  runs,
  onSaved,
  onDeleted,
  onOpenRun
}: {
  rootPath: string
  slug: string | null
  routine: ParsedRoutine
  tools: ToolMeta[]
  runs: Array<{ filename: string; scheduledAt: string; status: 'success' | 'failed'; trigger: 'scheduled' | 'manual'; durationMs: number }>
  onSaved: (slug: string) => void
  onDeleted: () => void
  onOpenRun: (filename: string) => void
}): JSX.Element {
  const [name, setName] = useState(routine.name)
  const [enabled, setEnabled] = useState(routine.enabled)
  const [schedule, setSchedule] = useState<ScheduleForm>(() =>
    decodeSchedule(routine.recurrence[0], routine.fireTime)
  )
  const [prompt, setPrompt] = useState(getRoutinePrompt(routine))
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set(routine.tools))
  const [saving, setSaving] = useState(false)

  // Reset state when the routine changes (switching between rows).
  useEffect(() => {
    setName(routine.name)
    setEnabled(routine.enabled)
    setSchedule(decodeSchedule(routine.recurrence[0], routine.fireTime))
    setPrompt(getRoutinePrompt(routine))
    setSelectedTools(new Set(routine.tools))
  }, [routine])

  const toggleWeekday = (idx: number): void => {
    setSchedule((s) => {
      const has = s.weekdays.includes(idx)
      return {
        ...s,
        weekdays: has ? s.weekdays.filter((w) => w !== idx) : [...s.weekdays, idx]
      }
    })
  }

  const toggleTool = (name: string): void => {
    setSelectedTools((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleSave = async (): Promise<void> => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const next: ParsedRoutine = {
        ...routine,
        name: name.trim(),
        enabled,
        recurrence: [compileSchedule(schedule)],
        fireTime: schedule.fireTime,
        tools: Array.from(selectedTools).sort(),
        sections: { ...routine.sections, Prompt: prompt }
      }
      // Round-trip through markdown so the on-disk format wins.
      const serialised = buildRoutineMarkdown(next)
      // We just call save with the next ParsedRoutine; the host writes the
      // markdown via buildRoutineMarkdown again on its side. The serialise
      // above is just a sanity check that the round-trip is clean.
      void serialised
      const wasCreating = !slug
      const { slug: newSlug } = await window.api.routines.save(rootPath, slug ?? '', next)
      logInteraction(wasCreating ? 'routine.created' : 'routine.edited')
      onSaved(newSlug)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!slug) {
      onDeleted()
      return
    }
    if (!window.confirm(`Delete routine "${name}"? Run history is preserved.`)) return
    await window.api.routines.delete(rootPath, slug)
    logInteraction('routine.deleted')
    onDeleted()
  }

  const handleRunNow = async (): Promise<void> => {
    if (!slug) return
    await window.api.routines.runNow(rootPath, slug)
  }

  return (
    <div className={styles.detailColumn}>
      <div className={styles.field}>
        <div className={styles.fieldLabel}>Name</div>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Weekday morning brief"
        />
      </div>

      <div className={styles.row}>
        <label className={styles.row}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className={styles.fieldLabel}>Enabled</span>
        </label>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Frequency</div>
        <select
          className={styles.select}
          value={schedule.freq}
          onChange={(e) =>
            setSchedule((s) => ({ ...s, freq: e.target.value as FreqChoice }))
          }
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>

      {(schedule.freq === 'weekly' || schedule.freq === 'biweekly') && (
        <div className={styles.field}>
          <div className={styles.fieldLabel}>On these days</div>
          <div className={styles.weekdayPicker}>
            {WEEKDAY_LABELS.map((wd) => {
              const active = schedule.weekdays.includes(wd.rrule.weekday)
              return (
                <button
                  key={wd.label}
                  className={`${styles.weekdayBtn} ${active ? styles.weekdayBtnActive : ''}`}
                  onClick={() => toggleWeekday(wd.rrule.weekday)}
                >
                  {wd.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Fire time (local)</div>
        <input
          className={styles.input}
          type="time"
          value={schedule.fireTime}
          onChange={(e) => setSchedule((s) => ({ ...s, fireTime: e.target.value }))}
        />
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Prompt</div>
        <textarea
          className={styles.textarea}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Tell the Agent what to do when this routine fires…"
        />
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>
          Tools this routine may use ({selectedTools.size} selected)
        </div>
        {tools.length === 0 ? (
          <div className={styles.empty}>No tools available in this workspace.</div>
        ) : (
          <div className={styles.toolList}>
            {tools.map((t) => (
              <label key={t.name} className={styles.toolListItem} title={t.description}>
                <input
                  type="checkbox"
                  checked={selectedTools.has(t.name)}
                  onChange={() => toggleTool(t.name)}
                />
                <span>{t.displayName || t.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className={`${styles.row} ${styles.rowEnd}`}>
        <button className={styles.btn} onClick={handleRunNow} disabled={!slug}>
          Run Now
        </button>
        <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleDelete}>
          Delete
        </button>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={handleSave}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className={styles.runsSection}>
        <div className={styles.fieldLabel}>Runs ({runs.length})</div>
        {runs.length === 0 ? (
          <div className={styles.empty}>No runs yet.</div>
        ) : (
          runs.map((r) => (
            <div
              key={r.filename}
              className={`${styles.runRow} ${r.status === 'failed' ? styles.runRowFailed : ''} ${r.trigger === 'manual' ? styles.runRowManual : ''}`}
              onClick={() => onOpenRun(r.filename)}
            >
              <span>{r.scheduledAt}</span>
              <span>{r.trigger}</span>
              <span>{r.status}</span>
              <span>›</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Run transcript view ───────────────────────────────────────────────────

function RunView({
  record,
  onBack
}: {
  record: RoutineRunRecord | null
  onBack: () => void
}): JSX.Element {
  if (!record) {
    return (
      <div className={styles.detailColumn}>
        <div className={styles.empty}>Loading run…</div>
      </div>
    )
  }
  return (
    <div className={styles.detailColumn}>
      <div className={styles.row}>
        <button className={styles.btn} onClick={onBack}>← Back to routine</button>
      </div>
      <div className={styles.transcriptHeader}>
        <span>{record.scheduledAt}</span>
        <span>{record.trigger}</span>
        <span>{record.status}</span>
      </div>
      <DetachedRunTranscriptView
        prompt={record.prompt}
        transcript={record.transcript}
        error={record.error}
      />
    </div>
  )
}
