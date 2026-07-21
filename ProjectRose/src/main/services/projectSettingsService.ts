import { readFile, writeFile } from 'fs/promises'
import { listInstalledExtensions } from './extensionService'
import { listBuiltinMainManifests } from '../extensions/builtins/manifests'
import { prPath } from '../lib/projectPaths'
import { toolRegistry } from './toolRegistry'
import type { ToolMeta } from '../../shared/types'

export interface ProjectSettings {
  disabledTools: string[]
  disabledPrompts: string[]
  /**
   * Names of `defaultDisabled` built-in tools that have already been seeded
   * into `disabledTools[]` for this workspace. We track this so that if the
   * user later enables one of them in Settings → Tools (i.e. removes it from
   * `disabledTools[]`), a subsequent app update that adds another
   * `defaultDisabled` tool doesn't re-add the one the user explicitly
   * enabled.
   */
  seededDefaultDisabledTools?: string[]
}

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  disabledTools: [],
  disabledPrompts: [],
  seededDefaultDisabledTools: []
}

// User-facing labels for core tools. The list of names that actually exist
// comes from the registry (`toolRegistry.getCoreToolNames()`); this table is
// only the display strings. If a new core tool is registered without a row
// here, it surfaces in the UI with its bare name as fallback.
const CORE_TOOL_DISPLAY: Record<string, { displayName: string; description: string }> = {
  read_file: { displayName: 'Read File', description: 'Read the contents of any file in the project' },
  write_file: { displayName: 'Write File', description: 'Write or overwrite file contents' },
  edit_file: { displayName: 'Edit File', description: 'Replace a unique string in a file (requires prior read_file)' },
  list_directory: { displayName: 'List Directory', description: 'List files and subdirectories' },
  grep: { displayName: 'Grep', description: 'Search file contents by regex pattern' },
  run_command: { displayName: 'Run Command', description: 'Execute shell commands in the project' },
  ask_user: { displayName: 'Ask User', description: 'Pause generation to ask the user a clarifying question' },
  create_subagents: { displayName: 'Subagents', description: 'Spawn one or more subagents to run focused tasks in parallel' },
  explore: { displayName: 'Explore', description: 'Decompose a topic into parallel read-only sub-queries and return a combined report' },
  search_web: { displayName: 'Web Search', description: 'Search the web via the ProjectRose search API' }
}

// Tools registered in `buildCoreTools` that belong, semantically, to a built-in
// extension. The runtime wiring lives in the host (rose-contacts has no main.js),
// but the Settings → Tools UI displays them in their own per-extension box so
// the catalog matches the "box per extension" pattern.
//
// `defaultDisabled: true` mirrors the manifest field of the same name on
// installed extensions: when a workspace's project-settings.json doesn't yet
// list a tool in `disabledTools[]`, `readProjectSettings()` seeds it from
// this map so destructive tools (send / reply / forward / release) are off
// until the user opts in.
interface BuiltinExtensionToolMeta {
  extensionId: string
  extensionName: string
  displayName: string
  description: string
  defaultDisabled?: boolean
}

const BUILTIN_EXTENSION_TOOLS: Record<string, BuiltinExtensionToolMeta> = {
  contacts_new: {
    extensionId: 'rose-contacts',
    extensionName: 'Contacts',
    displayName: 'New Contact',
    description: 'Create an empty contact entry classified as person, business, website, or other'
  },
  contacts_set_kind: {
    extensionId: 'rose-contacts',
    extensionName: 'Contacts',
    displayName: 'Set Contact Kind',
    description: 'Reclassify an existing contact (person / business / website / other)'
  },
  contacts_read: {
    extensionId: 'rose-contacts',
    extensionName: 'Contacts',
    displayName: 'Read Contact',
    description: 'Read every note about a person/place/thing by name'
  },
  contacts_search: {
    extensionId: 'rose-contacts',
    extensionName: 'Contacts',
    displayName: 'Search Contacts',
    description: 'Search contacts by name and find notes that mention a term'
  },
  contacts_add_note: {
    extensionId: 'rose-contacts',
    extensionName: 'Contacts',
    displayName: 'Add Contact Note',
    description: 'Append a note to a contact; creates the contact if missing'
  },
  contacts_remove_note: {
    extensionId: 'rose-contacts',
    extensionName: 'Contacts',
    displayName: 'Remove Contact Note',
    description: 'Remove a note from a contact, matched case-insensitively'
  },
  // ── rose-calendar ─────────────────────────────────────────────────────
  events_create: {
    extensionId: 'rose-calendar',
    extensionName: 'Calendar',
    displayName: 'Create Event',
    description: 'Create a calendar event; can be pushed to Google Calendar'
  },
  events_edit: {
    extensionId: 'rose-calendar',
    extensionName: 'Calendar',
    displayName: 'Edit Event',
    description: 'Modify an existing calendar event (summary, times, attendees, recurrence, etc.)'
  },
  events_get: {
    extensionId: 'rose-calendar',
    extensionName: 'Calendar',
    displayName: 'Get Event',
    description: 'Read the full record of a calendar event by ref or Google ID'
  },
  events_list: {
    extensionId: 'rose-calendar',
    extensionName: 'Calendar',
    displayName: 'List Events',
    description: 'List events in a date-time range, expanding recurring rules into occurrences'
  },
  events_invite: {
    extensionId: 'rose-calendar',
    extensionName: 'Calendar',
    displayName: 'Invite to Event',
    description: 'Send Google Calendar invitations to attendees of a synced event.',
    defaultDisabled: true
  },
  events_delete: {
    extensionId: 'rose-calendar',
    extensionName: 'Calendar',
    displayName: 'Delete Event',
    description: 'Delete a calendar event (also removes the remote copy if synced).',
    defaultDisabled: true
  },
  // ── rose-email ────────────────────────────────────────────────────────
  email_list_messages: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'List Messages',
    description: 'List inbox or folder messages'
  },
  email_search: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'Search',
    description: 'Search messages by free-text query'
  },
  email_get_message: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'Get Message',
    description: 'Fetch a full message'
  },
  email_list_folders: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'List Folders',
    description: 'List folders or Gmail labels'
  },
  email_draft_message: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'Draft Message',
    description: 'Create a draft (no send)'
  },
  email_send_message: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'Send Message',
    description: 'Send a new message.',
    defaultDisabled: true
  },
  email_reply: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'Reply',
    description: 'Reply to a message.',
    defaultDisabled: true
  },
  email_forward: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'Forward',
    description: 'Forward a message.',
    defaultDisabled: true
  },
  email_mark_read: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'Mark Read',
    description: 'Toggle read/unread on a message'
  },
  email_archive: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'Archive',
    description: 'Archive a message (move out of INBOX)'
  },
  email_move: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'Move',
    description: 'Move a message to a folder/label'
  },
  email_label: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'Label',
    description: 'Add or remove a label/keyword on a message'
  },
  email_delete: {
    extensionId: 'rose-email',
    extensionName: 'Email',
    displayName: 'Delete',
    description: 'Move a message to Trash (no hard-delete)'
  },
}

/**
 * The tool names that ship with `defaultDisabled: true`. New workspaces are
 * seeded with these in `disabledTools[]`, matching the behaviour of
 * `applyDefaultDisabledTools()` for installed extensions but at first-read
 * time (built-ins are never installed, so there's no install hook to fire).
 *
 * Two sources:
 *  1. `BUILTIN_EXTENSION_TOOLS` above — covers tools registered via the
 *     host's `buildCoreTools` (rose-contacts / rose-calendar / rose-email)
 *     that don't have their own manifest entry.
 *  2. Built-in main modules' manifests — covers extensions that register
 *     their tools via `ctx.registerTools()` and declare them in
 *     `provides.tools[]` (rose-channels). Walked at read-time so adding a
 *     new built-in with new default-off tools picks them up automatically.
 */
function collectBuiltinDefaultDisabledTools(): string[] {
  const out = new Set<string>()
  for (const [name, meta] of Object.entries(BUILTIN_EXTENSION_TOOLS)) {
    if (meta.defaultDisabled === true) out.add(name)
  }
  for (const manifest of listBuiltinMainManifests()) {
    for (const t of manifest.provides.tools ?? []) {
      if (t.defaultDisabled === true) out.add(t.name)
    }
  }
  return [...out]
}

export async function readProjectSettings(rootPath: string): Promise<ProjectSettings> {
  const path = prPath(rootPath, 'project-settings.json')
  let raw: Partial<ProjectSettings> = {}
  try {
    raw = JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    raw = {}
  }
  const seeded = new Set(raw.seededDefaultDisabledTools ?? [])
  const disabled = new Set(raw.disabledTools ?? [])
  let changed = false
  for (const tool of collectBuiltinDefaultDisabledTools()) {
    if (!seeded.has(tool)) {
      disabled.add(tool)
      seeded.add(tool)
      changed = true
    }
  }
  const settings: ProjectSettings = {
    ...DEFAULT_PROJECT_SETTINGS,
    ...raw,
    disabledTools: [...disabled],
    seededDefaultDisabledTools: [...seeded]
  }
  if (changed) {
    try {
      await writeFile(path, JSON.stringify(settings, null, 2))
    } catch {
      // tolerate — caller still gets the seeded values in-memory.
    }
  }
  return settings
}

export async function writeProjectSettings(
  rootPath: string,
  patch: Partial<ProjectSettings>
): Promise<ProjectSettings> {
  const current = await readProjectSettings(rootPath)
  const updated = { ...current, ...patch }
  await writeFile(prPath(rootPath, 'project-settings.json'), JSON.stringify(updated, null, 2))
  return updated
}

export async function listTools(rootPath: string): Promise<ToolMeta[]> {
  const coreMeta: ToolMeta[] = toolRegistry.getCoreToolNames().map((name) => {
    const builtin = BUILTIN_EXTENSION_TOOLS[name]
    if (builtin) {
      return {
        name,
        displayName: builtin.displayName,
        description: builtin.description,
        type: 'extension',
        extensionId: builtin.extensionId,
        extensionName: builtin.extensionName
      }
    }
    const display = CORE_TOOL_DISPLAY[name]
    return {
      name,
      displayName: display?.displayName ?? name,
      description: display?.description ?? '',
      type: 'core'
    }
  })

  const installed = await listInstalledExtensions(rootPath)
  const extensionMeta = installed
    .filter((ext) => ext.enabled && ext.manifest.provides.tools?.length)
    .flatMap((ext) =>
      (ext.manifest.provides.tools ?? []).map((t) => ({
        name: t.name,
        displayName: t.displayName,
        description: t.description,
        type: 'extension' as const,
        extensionId: ext.manifest.id,
        extensionName: ext.manifest.name
      }))
    )

  // Built-in extensions that register tools via `ctx.registerTools()` (e.g.
  // rose-channels). Their tools aren't in `getCoreToolNames()` (they're not
  // host built-ins) and they're not in `listInstalledExtensions` (they're
  // not installed). Surface them here directly from the manifests so the
  // picker shows them alongside everything else.
  const builtinExtensionMeta = listBuiltinMainManifests()
    .filter((m) => m.provides.tools?.length)
    .flatMap((m) =>
      (m.provides.tools ?? []).map((t) => ({
        name: t.name,
        displayName: t.displayName,
        description: t.description,
        type: 'extension' as const,
        extensionId: m.id,
        extensionName: m.name
      }))
    )

  return [...coreMeta, ...extensionMeta, ...builtinExtensionMeta]
}
