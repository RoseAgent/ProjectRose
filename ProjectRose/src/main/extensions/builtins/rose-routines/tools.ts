// Agent-callable tools rose-routines registers via ctx.registerTools().
//
// These wrap the CRUD + scheduler entry points in `main.ts` so the agent can
// manage routines from chat. Writes go through `saveRoutine`/`deleteRoutine`
// (never the filesystem directly) so every change reschedules the timer and
// broadcasts `routines:changed` to the Routines page, exactly like an edit
// made in the UI.
//
// Schema note: the registry's JSON-Schema → zod converter supports string,
// number, and enum only — so `tools` is a comma-separated string and
// `enabled` is a 'true'/'false' enum rather than arrays/booleans.

import type { ExtensionToolEntry } from '@shared/extension-types'
import {
  getRoutinePrompt,
  slugifyRoutineName,
  type ParsedRoutine
} from '@shared/routineFields'
import {
  createRoutine,
  deleteRoutine,
  listRoutines,
  listRuns,
  readRoutine,
  readRun,
  runNow,
  saveRoutine
} from './main'

const FIRE_TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

function assertFireTime(value: string): void {
  if (!FIRE_TIME_RE.test(value)) {
    throw new Error(`Invalid fire-time "${value}" — expected 24h HH:MM (e.g. "09:00").`)
  }
}

/** Mirror of routineFields' bullet normalisation: bare rules get the RRULE: prefix. */
function normaliseRrule(value: string): string {
  return value.toUpperCase().startsWith('RRULE:') ? value : `RRULE:${value}`
}

function parseToolsCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function routineSummary(slug: string, routine: ParsedRoutine): Record<string, unknown> {
  return {
    slug,
    name: routine.name,
    enabled: routine.enabled,
    recurrence: routine.recurrence,
    fireTime: routine.fireTime,
    tools: routine.tools,
    createdAt: routine.createdAt,
    lastFiredAt: routine.lastFiredAt
  }
}

async function readRoutineOrThrow(projectRoot: string, slug: string): Promise<ParsedRoutine> {
  const routine = await readRoutine(projectRoot, slug)
  if (!routine) {
    throw new Error(`No routine with slug "${slug}". Use routines_list to see what exists.`)
  }
  return routine
}

export function buildRoutinesTools(): ExtensionToolEntry[] {
  return [
    {
      name: 'routines_list',
      description:
        'List the routines in the current workspace with their schedule, tool allowlist, and last-fired time. Read-only.',
      schema: { type: 'object', properties: {} },
      execute: async (_input, projectRoot): Promise<string> => {
        const all = await listRoutines(projectRoot)
        return JSON.stringify(all.map(({ slug, routine }) => routineSummary(slug, routine)))
      }
    },
    {
      name: 'routines_read',
      description:
        "Read one routine's full definition by slug, including the prompt it runs. Read-only.",
      schema: {
        type: 'object',
        required: ['slug'],
        properties: {
          slug: { type: 'string', description: 'Routine slug (from routines_list).' }
        }
      },
      execute: async (input, projectRoot): Promise<string> => {
        const { slug } = input as { slug: string }
        const routine = await readRoutineOrThrow(projectRoot, slug)
        return JSON.stringify({
          ...routineSummary(slug, routine),
          prompt: getRoutinePrompt(routine)
        })
      }
    },
    {
      name: 'routines_create',
      description:
        'Create a new routine that fires the agent on a schedule. The routine name becomes its slug. ' +
        'Omit recurrence for a routine that only runs when triggered manually.',
      schema: {
        type: 'object',
        required: ['name', 'prompt'],
        properties: {
          name: { type: 'string', description: 'Display name, e.g. "Weekday morning brief".' },
          prompt: { type: 'string', description: 'The prompt the agent runs on each fire.' },
          recurrence: {
            type: 'string',
            description:
              'RRULE recurrence, e.g. "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" (the RRULE: prefix is optional).'
          },
          fireTime: {
            type: 'string',
            description: 'Local 24h clock time HH:MM to fire on each occurrence. Default 09:00.'
          },
          tools: {
            type: 'string',
            description:
              'Comma-separated tool names the routine may use (e.g. "email_list_messages,memory_list_events"). Empty = text-only run.'
          },
          enabled: {
            type: 'string',
            enum: ['true', 'false'],
            description: 'Whether the scheduler fires this routine. Default true.'
          }
        }
      },
      execute: async (input, projectRoot): Promise<string> => {
        const { name, prompt, recurrence, fireTime, tools, enabled } = input as {
          name: string
          prompt: string
          recurrence?: string
          fireTime?: string
          tools?: string
          enabled?: string
        }
        const slug = slugifyRoutineName(name)
        const existing = await readRoutine(projectRoot, slug)
        if (existing) {
          throw new Error(
            `A routine with slug "${slug}" already exists. Use routines_update to change it.`
          )
        }
        if (fireTime !== undefined) assertFireTime(fireTime)
        const partial: Partial<ParsedRoutine> & { name: string } = {
          name,
          sections: { Prompt: prompt }
        }
        if (recurrence !== undefined) partial.recurrence = [normaliseRrule(recurrence)]
        if (fireTime !== undefined) partial.fireTime = fireTime
        if (tools !== undefined) partial.tools = parseToolsCsv(tools)
        if (enabled !== undefined) partial.enabled = enabled === 'true'
        const result = await createRoutine(projectRoot, partial)
        return JSON.stringify(result)
      }
    },
    {
      name: 'routines_update',
      description:
        "Update an existing routine by slug. Only the fields you pass change; the slug never changes, even when renaming.",
      schema: {
        type: 'object',
        required: ['slug'],
        properties: {
          slug: { type: 'string', description: 'Routine slug (from routines_list).' },
          name: { type: 'string', description: 'New display name.' },
          prompt: { type: 'string', description: 'New prompt body (replaces the old one).' },
          recurrence: {
            type: 'string',
            description: 'New RRULE recurrence (the RRULE: prefix is optional). Replaces existing rules.'
          },
          fireTime: { type: 'string', description: 'New local 24h clock time HH:MM.' },
          tools: {
            type: 'string',
            description: 'New comma-separated tool allowlist (replaces the old one). Empty string = no tools.'
          },
          enabled: {
            type: 'string',
            enum: ['true', 'false'],
            description: 'Enable or disable the schedule.'
          }
        }
      },
      execute: async (input, projectRoot): Promise<string> => {
        const { slug, name, prompt, recurrence, fireTime, tools, enabled } = input as {
          slug: string
          name?: string
          prompt?: string
          recurrence?: string
          fireTime?: string
          tools?: string
          enabled?: string
        }
        const routine = await readRoutineOrThrow(projectRoot, slug)
        if (fireTime !== undefined) assertFireTime(fireTime)
        if (name !== undefined) routine.name = name
        if (prompt !== undefined) routine.sections['Prompt'] = prompt
        if (recurrence !== undefined) routine.recurrence = [normaliseRrule(recurrence)]
        if (fireTime !== undefined) routine.fireTime = fireTime
        if (tools !== undefined) routine.tools = parseToolsCsv(tools)
        if (enabled !== undefined) routine.enabled = enabled === 'true'
        await saveRoutine(projectRoot, slug, routine)
        return JSON.stringify(routineSummary(slug, routine))
      }
    },
    {
      name: 'routines_delete',
      description:
        'Delete a routine definition by slug. Its run history is kept on disk for audit.',
      schema: {
        type: 'object',
        required: ['slug'],
        properties: {
          slug: { type: 'string', description: 'Routine slug (from routines_list).' }
        }
      },
      execute: async (input, projectRoot): Promise<string> => {
        const { slug } = input as { slug: string }
        const routine = await readRoutineOrThrow(projectRoot, slug)
        await deleteRoutine(projectRoot, slug)
        return `Deleted routine "${routine.name}" (${slug}). Run history kept.`
      }
    },
    {
      name: 'routines_run_now',
      description:
        'Fire a routine immediately, off-schedule. Returns as soon as the run starts; the transcript lands in run history when it completes.',
      schema: {
        type: 'object',
        required: ['slug'],
        properties: {
          slug: { type: 'string', description: 'Routine slug (from routines_list).' }
        }
      },
      execute: async (input, projectRoot): Promise<string> => {
        const { slug } = input as { slug: string }
        const routine = await readRoutineOrThrow(projectRoot, slug)
        const { ok } = await runNow(projectRoot, slug)
        if (!ok) {
          throw new Error('The routine scheduler is not running for this workspace.')
        }
        return `Started a manual run of "${routine.name}". Check routines_list_runs for the result.`
      }
    },
    {
      name: 'routines_list_runs',
      description:
        "List a routine's past runs (newest first) with status, trigger, and duration. Read-only.",
      schema: {
        type: 'object',
        required: ['slug'],
        properties: {
          slug: { type: 'string', description: 'Routine slug (from routines_list).' }
        }
      },
      execute: async (input, projectRoot): Promise<string> => {
        const { slug } = input as { slug: string }
        const runs = await listRuns(projectRoot, slug)
        return JSON.stringify(runs)
      }
    },
    {
      name: 'routines_read_run',
      description:
        'Read the full markdown transcript of one routine run. Read-only.',
      schema: {
        type: 'object',
        required: ['slug', 'filename'],
        properties: {
          slug: { type: 'string', description: 'Routine slug (from routines_list).' },
          filename: { type: 'string', description: 'Run filename (from routines_list_runs).' }
        }
      },
      execute: async (input, projectRoot): Promise<string> => {
        const { slug, filename } = input as { slug: string; filename: string }
        const content = await readRun(projectRoot, slug, filename)
        if (content === null) {
          throw new Error(`No run "${filename}" for routine "${slug}". Use routines_list_runs to see what exists.`)
        }
        return content
      }
    }
  ]
}
