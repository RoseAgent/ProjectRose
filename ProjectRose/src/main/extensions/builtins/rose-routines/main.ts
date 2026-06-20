// rose-routines — main-process module.
//
// Per ADR 0013, this extension owns the Routine concept end-to-end: scans
// `<workspace>/.projectrose/routines/` for routine definitions, schedules
// each enabled one with `rrule.after(now) + setTimeout`, and on fire calls
// `ctx.runDetachedRunWithTools(prompt, systemPrompt, { allowedTools })` to
// run the prompt with the routine's tool allowlist. Each fire (scheduled
// or manual) produces a transcript file under
// `<workspace>/.projectrose/routines/<slug>/runs/{timestamp}.md`.
//
// The scheduler is strict workspace-local (Q6): when the workspace closes,
// the cleanup function returned from register() cancels every pending
// timeout. Missed fires are silently skipped — no catch-up.

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import { RRule, rrulestr } from 'rrule'
import type { ExtensionMainContext } from '@shared/extension-contract'
import { logInteraction } from '../../../services/interactionLog'
import {
  buildRoutineMarkdown,
  emptyRoutine,
  getRoutinePrompt,
  parseRoutineContent,
  slugifyRoutineName,
  type ParsedRoutine
} from '@shared/routineFields'
import { isoLocal, timestampForFilename } from '@shared/detachedRunTranscript'
import {
  buildRunMarkdown,
  type RoutineRunRecord,
  type RoutineRunTrigger
} from '@shared/routineRun'
import { notifyFailure } from '../../../tray'

export { manifest } from './manifest'

const ROUTINES_DIR = '.projectrose/routines'
const ROUTINES_CHANGED_CHANNEL = 'routines:changed'

interface SchedulerEntry {
  slug: string
  timer: NodeJS.Timeout
  scheduledFor: Date
}

interface RoutineRuntimeState {
  rootPath: string
  ctx: ExtensionMainContext
  /** keyed by slug */
  entries: Map<string, SchedulerEntry>
  /** prevent overlapping runs of the same routine */
  running: Set<string>
}

const states = new Map<string, RoutineRuntimeState>()

function routinesDirFor(rootPath: string): string {
  return join(rootPath, ROUTINES_DIR)
}

function routineFilePath(rootPath: string, slug: string): string {
  return join(routinesDirFor(rootPath), `${slug}.md`)
}

function runsDirFor(rootPath: string, slug: string): string {
  return join(routinesDirFor(rootPath), slug, 'runs')
}

async function ensureRoutinesDir(rootPath: string): Promise<void> {
  await mkdir(routinesDirFor(rootPath), { recursive: true })
}

/** Read all routine files in the workspace, returning slug + parsed routine. */
export async function listRoutines(
  rootPath: string
): Promise<Array<{ slug: string; routine: ParsedRoutine }>> {
  await ensureRoutinesDir(rootPath)
  const dir = routinesDirFor(rootPath)
  let entries: string[] = []
  try {
    entries = await readdir(dir, 'utf-8')
  } catch {
    return []
  }
  const out: Array<{ slug: string; routine: ParsedRoutine }> = []
  for (const name of entries) {
    if (!name.endsWith('.md')) continue
    const slug = name.replace(/\.md$/, '')
    try {
      const content = await readFile(join(dir, name), 'utf-8')
      out.push({ slug, routine: parseRoutineContent(content) })
    } catch {
      /* skip broken files */
    }
  }
  return out
}

export async function readRoutine(
  rootPath: string,
  slug: string
): Promise<ParsedRoutine | null> {
  try {
    const content = await readFile(routineFilePath(rootPath, slug), 'utf-8')
    return parseRoutineContent(content)
  } catch {
    return null
  }
}

export async function saveRoutine(
  rootPath: string,
  slug: string,
  routine: ParsedRoutine
): Promise<{ slug: string }> {
  await ensureRoutinesDir(rootPath)
  const finalSlug = slug && slug.length > 0 ? slug : slugifyRoutineName(routine.name)
  const md = buildRoutineMarkdown(routine)
  await writeFile(routineFilePath(rootPath, finalSlug), md, 'utf-8')
  // Rebuild this routine's schedule entry.
  rescheduleRoutine(rootPath, finalSlug)
  broadcastChanged(rootPath)
  return { slug: finalSlug }
}

export async function deleteRoutine(rootPath: string, slug: string): Promise<void> {
  cancelEntry(rootPath, slug)
  try {
    await rm(routineFilePath(rootPath, slug))
  } catch {
    /* not found */
  }
  // Leave runs/ in place — user might still want to audit history.
  broadcastChanged(rootPath)
}

export interface RunListEntry {
  filename: string
  scheduledAt: string
  status: 'success' | 'failed'
  trigger: RoutineRunTrigger
  durationMs: number
}

/** List runs for a routine, newest first. Reads bullet header only for speed. */
export async function listRuns(rootPath: string, slug: string): Promise<RunListEntry[]> {
  const dir = runsDirFor(rootPath, slug)
  let files: string[] = []
  try {
    files = await readdir(dir, 'utf-8')
  } catch {
    return []
  }
  const out: RunListEntry[] = []
  for (const filename of files) {
    if (!filename.endsWith('.md')) continue
    try {
      const content = await readFile(join(dir, filename), 'utf-8')
      const header = parseRunHeaderOnly(content)
      out.push({
        filename,
        scheduledAt: header.scheduledAt,
        status: header.status,
        trigger: header.trigger,
        durationMs: header.durationMs
      })
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => (a.scheduledAt > b.scheduledAt ? -1 : 1))
  return out
}

export async function readRun(
  rootPath: string,
  slug: string,
  filename: string
): Promise<string | null> {
  try {
    return await readFile(join(runsDirFor(rootPath, slug), filename), 'utf-8')
  } catch {
    return null
  }
}

function parseRunHeaderOnly(content: string): {
  scheduledAt: string
  status: 'success' | 'failed'
  trigger: RoutineRunTrigger
  durationMs: number
} {
  const out = {
    scheduledAt: '',
    status: 'success' as 'success' | 'failed',
    trigger: 'scheduled' as RoutineRunTrigger,
    durationMs: 0
  }
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    if (line.startsWith('## ')) break
    const m = line.match(/^\s*-\s+([a-z-]+):\s*(.+?)\s*$/)
    if (!m) continue
    const [, label, value] = m
    if (label === 'fire-time-scheduled') out.scheduledAt = value
    else if (label === 'status') out.status = value === 'failed' ? 'failed' : 'success'
    else if (label === 'trigger') out.trigger = value === 'manual' ? 'manual' : 'scheduled'
    else if (label === 'duration-ms') out.durationMs = Number.parseInt(value, 10) || 0
  }
  return out
}

// ── Scheduler ──────────────────────────────────────────────────────────────

/**
 * Build the next fire date for a routine by combining its RRULE with the
 * configured `fire-time` clock. RRULE expansion gives us the date; we set
 * the clock independently so the user picker stays simple ("9am on
 * Mondays" instead of BYHOUR=9;BYMINUTE=0 inside the RRULE).
 */
function nextFireFor(routine: ParsedRoutine, now: Date): Date | null {
  if (!routine.enabled) return null
  if (routine.recurrence.length === 0) return null
  const [hh, mm] = routine.fireTime.split(':').map((s) => Number.parseInt(s, 10))
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null

  // The dtstart anchors the recurrence; we use today-at-fire-time so the
  // recurrence "starts" relative to the local clock. RRULE BYDAY etc. take
  // over from there.
  for (const rule of routine.recurrence) {
    try {
      const dtAnchor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0)
      const ruleStr = rule.startsWith('DTSTART') ? rule : `DTSTART:${toRRuleDate(dtAnchor)}\n${rule}`
      const set = rrulestr(ruleStr, { forceset: false })
      const rrule = set instanceof RRule ? set : null
      if (!rrule) continue
      // Find next occurrence STRICTLY after now. If today's fire time is in
      // the future, .after(now, false) returns today; otherwise the next
      // matching day.
      const nextDay = rrule.after(now, false)
      if (!nextDay) continue
      // Pin the clock to fire-time; RRULE's BYHOUR is irrelevant here.
      return new Date(
        nextDay.getFullYear(),
        nextDay.getMonth(),
        nextDay.getDate(),
        hh,
        mm,
        0,
        0
      )
    } catch {
      /* malformed rule — skip */
    }
  }
  return null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** RRULE library wants YYYYMMDDTHHMMSSZ format for DTSTART. */
function toRRuleDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  )
}

function cancelEntry(rootPath: string, slug: string): void {
  const state = states.get(rootPath)
  if (!state) return
  const entry = state.entries.get(slug)
  if (!entry) return
  clearTimeout(entry.timer)
  state.entries.delete(slug)
}

function rescheduleRoutine(rootPath: string, slug: string): void {
  const state = states.get(rootPath)
  if (!state) return
  cancelEntry(rootPath, slug)
  void scheduleOne(state, slug)
}

async function scheduleOne(state: RoutineRuntimeState, slug: string): Promise<void> {
  const routine = await readRoutine(state.rootPath, slug)
  if (!routine || !routine.enabled) return
  const next = nextFireFor(routine, new Date())
  if (!next) return
  const delayMs = Math.max(0, next.getTime() - Date.now())
  // setTimeout caps around 24.8 days; for longer recurrences (e.g. yearly)
  // hop in chunks so the OS doesn't silently coerce a huge value.
  const SAFE_MAX = 1000 * 60 * 60 * 24 * 20
  if (delayMs > SAFE_MAX) {
    const timer = setTimeout(() => {
      void scheduleOne(state, slug)
    }, SAFE_MAX)
    state.entries.set(slug, { slug, timer, scheduledFor: next })
    return
  }
  const timer = setTimeout(() => {
    void fireRoutine(state, slug, next, 'scheduled')
  }, delayMs)
  state.entries.set(slug, { slug, timer, scheduledFor: next })
}

async function fireRoutine(
  state: RoutineRuntimeState,
  slug: string,
  scheduledFor: Date,
  trigger: RoutineRunTrigger
): Promise<void> {
  // Re-read the routine fresh — the user may have toggled it off, edited
  // the prompt, or changed the allowlist since we scheduled.
  const routine = await readRoutine(state.rootPath, slug)
  if (!routine) {
    cancelEntry(state.rootPath, slug)
    return
  }
  // Disabled mid-flight: skip the scheduled run, but a manual trigger still
  // fires (caller knows what they're doing).
  if (!routine.enabled && trigger === 'scheduled') {
    rescheduleRoutine(state.rootPath, slug)
    return
  }
  // Prevent overlapping runs of the same routine — if a prior fire is still
  // running and the next one is due, just reschedule.
  if (state.running.has(slug)) {
    rescheduleRoutine(state.rootPath, slug)
    return
  }
  state.running.add(slug)
  logInteraction('routine.fired', slug)

  const startedAt = new Date()
  const promptBody = getRoutinePrompt(routine).trim()
  let runRecord: RoutineRunRecord
  try {
    const transcript = await state.ctx.runDetachedRunWithTools(
      promptBody.length > 0 ? promptBody : `(empty prompt for routine "${routine.name}")`,
      `You are running on a schedule inside the Workspace at ${state.rootPath}. ` +
        `This is the routine "${routine.name}". No user is present — do not ask questions, ` +
        `just complete the requested work and respond with your result.`,
      { allowedTools: routine.tools }
    )
    runRecord = {
      routineSlug: slug,
      routineName: routine.name,
      trigger,
      status: 'success',
      scheduledAt: isoLocal(scheduledFor),
      startedAt: isoLocal(startedAt),
      prompt: promptBody,
      transcript,
      error: null,
      warnings: []
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    runRecord = {
      routineSlug: slug,
      routineName: routine.name,
      trigger,
      status: 'failed',
      scheduledAt: isoLocal(scheduledFor),
      startedAt: isoLocal(startedAt),
      prompt: promptBody,
      transcript: {
        entries: [],
        finalText: '',
        durationMs: Date.now() - startedAt.getTime(),
        inputTokens: 0,
        outputTokens: 0,
        modelDisplay: 'unknown'
      },
      error: message,
      warnings: []
    }
    notifyFailure(
      `Routine "${routine.name}" failed`,
      message.slice(0, 200)
    )
    state.ctx.notifyStatus(`Routine "${routine.name}" failed: ${message.slice(0, 120)}`, {
      tone: 'error',
      durationMs: 8000
    })
  } finally {
    state.running.delete(slug)
  }

  await writeRunFile(state.rootPath, slug, runRecord, startedAt)
  await updateLastFired(state.rootPath, slug, isoLocal(startedAt))
  broadcastChanged(state.rootPath)

  // Schedule the next occurrence.
  rescheduleRoutine(state.rootPath, slug)
}

async function writeRunFile(
  rootPath: string,
  slug: string,
  run: RoutineRunRecord,
  startedAt: Date
): Promise<void> {
  await mkdir(runsDirFor(rootPath, slug), { recursive: true })
  const filename = `${timestampForFilename(startedAt)}.md`
  await writeFile(join(runsDirFor(rootPath, slug), filename), buildRunMarkdown(run), 'utf-8')
}

async function updateLastFired(rootPath: string, slug: string, isoTs: string): Promise<void> {
  const routine = await readRoutine(rootPath, slug)
  if (!routine) return
  routine.lastFiredAt = isoTs
  await writeFile(routineFilePath(rootPath, slug), buildRoutineMarkdown(routine), 'utf-8')
}

function broadcastChanged(rootPath: string): void {
  const state = states.get(rootPath)
  state?.ctx.broadcast(ROUTINES_CHANGED_CHANNEL, { rootPath })
}

// ── Public IPC-facing operations ────────────────────────────────────────────

export async function runNow(rootPath: string, slug: string): Promise<{ ok: boolean }> {
  const state = states.get(rootPath)
  if (!state) return { ok: false }
  // Don't wait on it — the caller (IPC) returns immediately; the fire
  // produces a transcript file and a broadcast when it completes.
  void fireRoutine(state, slug, new Date(), 'manual')
  return { ok: true }
}

export async function createRoutine(
  rootPath: string,
  partial: Partial<ParsedRoutine> & { name: string }
): Promise<{ slug: string }> {
  const routine = { ...emptyRoutine(), ...partial }
  if (!routine.createdAt) routine.createdAt = isoLocal(new Date())
  if (!routine.sections['Prompt']) routine.sections['Prompt'] = partial.sections?.['Prompt'] ?? ''
  const slug = slugifyRoutineName(routine.name)
  return saveRoutine(rootPath, slug, routine)
}

// ── Registration entry ─────────────────────────────────────────────────────

export function register(ctx: ExtensionMainContext): () => void {
  const rootPath = ctx.rootPath
  if (!rootPath) return () => {}

  const state: RoutineRuntimeState = {
    rootPath,
    ctx,
    entries: new Map(),
    running: new Set()
  }
  states.set(rootPath, state)

  // Schedule every enabled routine currently on disk. Async; tolerable if
  // some routines are added/edited concurrently — saveRoutine re-schedules.
  void (async () => {
    try {
      const all = await listRoutines(rootPath)
      for (const { slug } of all) {
        await scheduleOne(state, slug)
      }
    } catch (err) {
      console.error('[rose-routines] initial scheduling failed:', err)
    }
  })()

  return () => {
    for (const entry of state.entries.values()) clearTimeout(entry.timer)
    state.entries.clear()
    states.delete(rootPath)
  }
}
