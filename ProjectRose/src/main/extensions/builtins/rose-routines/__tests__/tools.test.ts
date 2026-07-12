// Tests for the rose-routines agent tools.
//
// `../main` is mocked so these tests exercise the tool layer in isolation:
// input coercion (comma-separated tools, 'true'/'false' enabled, RRULE
// normalisation), error messages for missing routines, and the strict
// manifest ↔ registered-tools catalog contract (#37).

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { diffToolCatalog } from '../../../reconcileToolCatalog'
import { emptyRoutine, type ParsedRoutine } from '@shared/routineFields'
import { manifest as mainManifest } from '../manifest'
import { manifest as rendererManifest } from '../../../../../renderer/src/extensions/builtins/rose-routines/manifest'
import { buildRoutinesTools } from '../tools'
import {
  createRoutine,
  deleteRoutine,
  listRoutines,
  listRuns,
  readRoutine,
  readRun,
  runNow,
  saveRoutine
} from '../main'

vi.mock('../main', () => ({
  createRoutine: vi.fn(),
  deleteRoutine: vi.fn(),
  listRoutines: vi.fn(),
  listRuns: vi.fn(),
  readRoutine: vi.fn(),
  readRun: vi.fn(),
  runNow: vi.fn(),
  saveRoutine: vi.fn()
}))

const ROOT = '/workspace'
const CTX = { sessionId: 'test-session' }

function makeRoutine(overrides: Partial<ParsedRoutine> = {}): ParsedRoutine {
  return {
    ...emptyRoutine(),
    name: 'Morning brief',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
    sections: { Prompt: 'Summarize my inbox' },
    ...overrides
  }
}

function getTool(name: string): ReturnType<typeof buildRoutinesTools>[number] {
  const entry = buildRoutinesTools().find((t) => t.name === name)
  if (!entry) throw new Error(`tool ${name} not built`)
  return entry
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('catalog contract', () => {
  it('registered tool names exactly match the manifest declaration', () => {
    const drift = diffToolCatalog(mainManifest, buildRoutinesTools())
    expect(drift.declaredButNotRegistered).toEqual([])
    expect(drift.registeredButNotDeclared).toEqual([])
  })

  it('main and renderer manifests are identical', () => {
    expect(mainManifest).toEqual(rendererManifest)
  })
})

describe('routines_list', () => {
  it('returns a JSON summary per routine', async () => {
    vi.mocked(listRoutines).mockResolvedValue([
      { slug: 'morning-brief', routine: makeRoutine({ lastFiredAt: '2026-07-10T09:00:00' }) }
    ])
    const out = JSON.parse(await getTool('routines_list').execute({}, ROOT, CTX))
    expect(out).toEqual([
      {
        slug: 'morning-brief',
        name: 'Morning brief',
        enabled: true,
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
        fireTime: '09:00',
        tools: [],
        createdAt: null,
        lastFiredAt: '2026-07-10T09:00:00'
      }
    ])
  })
})

describe('routines_read', () => {
  it('includes the prompt body', async () => {
    vi.mocked(readRoutine).mockResolvedValue(makeRoutine())
    const out = JSON.parse(
      await getTool('routines_read').execute({ slug: 'morning-brief' }, ROOT, CTX)
    )
    expect(out.prompt).toBe('Summarize my inbox')
    expect(out.slug).toBe('morning-brief')
  })

  it('throws a helpful error when the routine does not exist', async () => {
    vi.mocked(readRoutine).mockResolvedValue(null)
    await expect(
      getTool('routines_read').execute({ slug: 'nope' }, ROOT, CTX)
    ).rejects.toThrow('No routine with slug "nope"')
  })
})

describe('routines_create', () => {
  it('creates with coerced inputs: RRULE prefix, tools csv, enabled flag', async () => {
    vi.mocked(createRoutine).mockResolvedValue({ slug: 'weekly-report' })
    const out = await getTool('routines_create').execute(
      {
        name: 'Weekly report',
        prompt: 'Write the weekly report',
        recurrence: 'FREQ=WEEKLY;BYDAY=FR',
        fireTime: '17:30',
        tools: ' email_list_messages, memory_list_events ,',
        enabled: 'false'
      },
      ROOT,
      CTX
    )
    expect(JSON.parse(out)).toEqual({ slug: 'weekly-report' })
    expect(createRoutine).toHaveBeenCalledWith(ROOT, {
      name: 'Weekly report',
      sections: { Prompt: 'Write the weekly report' },
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=FR'],
      fireTime: '17:30',
      tools: ['email_list_messages', 'memory_list_events'],
      enabled: false
    })
  })

  it('leaves optional fields to the routine defaults when omitted', async () => {
    vi.mocked(createRoutine).mockResolvedValue({ slug: 'ad-hoc' })
    await getTool('routines_create').execute(
      { name: 'Ad hoc', prompt: 'Do the thing' },
      ROOT,
      CTX
    )
    expect(createRoutine).toHaveBeenCalledWith(ROOT, {
      name: 'Ad hoc',
      sections: { Prompt: 'Do the thing' }
    })
  })

  it('surfaces the duplicate-slug rejection from createRoutine', async () => {
    vi.mocked(createRoutine).mockRejectedValue(
      new Error('A routine with slug "morning-brief" already exists. Use routines_update to change it.')
    )
    await expect(
      getTool('routines_create').execute(
        { name: 'Morning brief', prompt: 'p' },
        ROOT,
        CTX
      )
    ).rejects.toThrow('already exists')
  })

  it('rejects a malformed fire-time', async () => {
    await expect(
      getTool('routines_create').execute(
        { name: 'Bad time', prompt: 'p', fireTime: '25:00' },
        ROOT,
        CTX
      )
    ).rejects.toThrow('Invalid fire-time "25:00"')
    expect(createRoutine).not.toHaveBeenCalled()
  })
})

describe('routines_update', () => {
  it('changes only the provided fields and saves under the same slug', async () => {
    vi.mocked(readRoutine).mockResolvedValue(makeRoutine())
    vi.mocked(saveRoutine).mockResolvedValue({ slug: 'morning-brief' })
    await getTool('routines_update').execute(
      { slug: 'morning-brief', enabled: 'false', tools: 'email_get_message' },
      ROOT,
      CTX
    )
    expect(saveRoutine).toHaveBeenCalledWith(
      ROOT,
      'morning-brief',
      expect.objectContaining({
        name: 'Morning brief',
        enabled: false,
        tools: ['email_get_message'],
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
        sections: { Prompt: 'Summarize my inbox' }
      })
    )
  })

  it('replaces the prompt body when given', async () => {
    vi.mocked(readRoutine).mockResolvedValue(makeRoutine())
    vi.mocked(saveRoutine).mockResolvedValue({ slug: 'morning-brief' })
    await getTool('routines_update').execute(
      { slug: 'morning-brief', prompt: 'New prompt' },
      ROOT,
      CTX
    )
    expect(saveRoutine).toHaveBeenCalledWith(
      ROOT,
      'morning-brief',
      expect.objectContaining({ sections: { Prompt: 'New prompt' } })
    )
  })

  it('clears the schedule when recurrence is an empty string', async () => {
    vi.mocked(readRoutine).mockResolvedValue(makeRoutine())
    vi.mocked(saveRoutine).mockResolvedValue({ slug: 'morning-brief' })
    await getTool('routines_update').execute(
      { slug: 'morning-brief', recurrence: '' },
      ROOT,
      CTX
    )
    expect(saveRoutine).toHaveBeenCalledWith(
      ROOT,
      'morning-brief',
      expect.objectContaining({ recurrence: [] })
    )
  })

  it('throws when the routine does not exist', async () => {
    vi.mocked(readRoutine).mockResolvedValue(null)
    await expect(
      getTool('routines_update').execute({ slug: 'nope', name: 'x' }, ROOT, CTX)
    ).rejects.toThrow('No routine with slug "nope"')
    expect(saveRoutine).not.toHaveBeenCalled()
  })
})

describe('routines_delete', () => {
  it('deletes an existing routine', async () => {
    vi.mocked(readRoutine).mockResolvedValue(makeRoutine())
    const out = await getTool('routines_delete').execute({ slug: 'morning-brief' }, ROOT, CTX)
    expect(deleteRoutine).toHaveBeenCalledWith(ROOT, 'morning-brief')
    expect(out).toContain('Deleted routine "Morning brief"')
  })

  it('throws when the routine does not exist', async () => {
    vi.mocked(readRoutine).mockResolvedValue(null)
    await expect(
      getTool('routines_delete').execute({ slug: 'nope' }, ROOT, CTX)
    ).rejects.toThrow('No routine with slug "nope"')
    expect(deleteRoutine).not.toHaveBeenCalled()
  })
})

describe('routines_run_now', () => {
  it('starts a manual run', async () => {
    vi.mocked(readRoutine).mockResolvedValue(makeRoutine())
    vi.mocked(runNow).mockResolvedValue({ ok: true })
    const out = await getTool('routines_run_now').execute({ slug: 'morning-brief' }, ROOT, CTX)
    expect(runNow).toHaveBeenCalledWith(ROOT, 'morning-brief')
    expect(out).toContain('Started a manual run')
  })

  it('throws when the scheduler is not running for the workspace', async () => {
    vi.mocked(readRoutine).mockResolvedValue(makeRoutine())
    vi.mocked(runNow).mockResolvedValue({ ok: false })
    await expect(
      getTool('routines_run_now').execute({ slug: 'morning-brief' }, ROOT, CTX)
    ).rejects.toThrow('scheduler is not running')
  })
})

describe('run history tools', () => {
  it('routines_list_runs returns the run list as JSON', async () => {
    const runs = [
      {
        filename: '2026-07-10T09-00-00.md',
        scheduledAt: '2026-07-10T09:00:00',
        status: 'success' as const,
        trigger: 'scheduled' as const,
        durationMs: 1234
      }
    ]
    vi.mocked(listRuns).mockResolvedValue(runs)
    const out = await getTool('routines_list_runs').execute({ slug: 'morning-brief' }, ROOT, CTX)
    expect(JSON.parse(out)).toEqual(runs)
  })

  it('routines_read_run returns the transcript verbatim', async () => {
    vi.mocked(readRun).mockResolvedValue('# Run\n- status: success')
    const out = await getTool('routines_read_run').execute(
      { slug: 'morning-brief', filename: '2026-07-10T09-00-00.md' },
      ROOT,
      CTX
    )
    expect(out).toBe('# Run\n- status: success')
  })

  it('routines_read_run throws for a missing transcript', async () => {
    vi.mocked(readRun).mockResolvedValue(null)
    await expect(
      getTool('routines_read_run').execute({ slug: 'morning-brief', filename: 'nope.md' }, ROOT, CTX)
    ).rejects.toThrow('No run "nope.md"')
  })
})
