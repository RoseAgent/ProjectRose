// Main-side manifest for rose-routines, kept in its own module so the
// project-settings service can read the declared tools without pulling in
// `main.ts` (which transitively imports electron / tray and breaks the
// vitest node environment).
//
// Must stay byte-for-byte equivalent to the renderer-side manifest at
// `src/renderer/src/extensions/builtins/rose-routines/manifest.ts`.

import type { ExtensionManifest } from '@shared/extension-types'

export const manifest: ExtensionManifest = {
  id: 'rose-routines',
  name: 'Routines',
  version: '1.0.0',
  description:
    'Recurring prompts that fire the Agent on a calendar schedule. Each fire is saved for audit.',
  author: 'ProjectRose',
  latin: 'Rota',
  navItem: { label: 'Routines', iconName: 'clock' },
  provides: {
    pageView: true,
    main: true,
    detachedRunWithTools: true,
    agentTools: true,
    notifyStatus: true,
    broadcast: true,
    tools: [
      {
        name: 'routines_list',
        displayName: 'List routines',
        description: 'Read-only: list the routines in this workspace with schedule and status.'
      },
      {
        name: 'routines_read',
        displayName: 'Read a routine',
        description: "Read-only: one routine's full definition, including its prompt."
      },
      {
        name: 'routines_create',
        displayName: 'Create a routine',
        description: 'Create a new scheduled routine with a prompt, recurrence, and tool allowlist.'
      },
      {
        name: 'routines_update',
        displayName: 'Update a routine',
        description: "Change an existing routine's prompt, schedule, tools, or enabled state."
      },
      {
        name: 'routines_delete',
        displayName: 'Delete a routine',
        description: 'Delete a routine definition. Its run history is kept for audit.'
      },
      {
        name: 'routines_run_now',
        displayName: 'Run a routine now',
        description: 'Fire a routine immediately, off-schedule.'
      },
      {
        name: 'routines_list_runs',
        displayName: 'List routine runs',
        description: "Read-only: a routine's run history, newest first."
      },
      {
        name: 'routines_read_run',
        displayName: 'Read a run transcript',
        description: 'Read-only: the full transcript of one routine run.'
      }
    ]
  }
}
