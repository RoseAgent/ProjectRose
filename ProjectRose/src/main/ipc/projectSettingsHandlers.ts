import { readFile, writeFile } from 'fs/promises'
import { ipcMain } from 'electron'
import { discoverPythonTools } from '../services/toolHandlers'
import { prPath } from '../lib/projectPaths'

export interface ProjectSettings {
  disabledTools: string[]
}

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = { disabledTools: [] }

export const CORE_TOOL_NAMES = new Set([
  'read_file', 'write_file', 'list_directory', 'search_code',
  'find_references', 'run_command', 'get_project_overview',
  'memory_read', 'memory_write', 'memory_search', 'memory_list', 'memory_delete',
  'list_emails', 'read_email', 'move_email_to_folder', 'delete_email',
  'list_discord_channels', 'read_discord_messages', 'send_discord_message'
])

const CORE_TOOL_META = [
  { name: 'read_file', displayName: 'Read File', description: 'Read the contents of any file in the project', type: 'core' as const },
  { name: 'write_file', displayName: 'Write File', description: 'Write or overwrite file contents', type: 'core' as const },
  { name: 'list_directory', displayName: 'List Directory', description: 'List files and subdirectories', type: 'core' as const },
  { name: 'search_code', displayName: 'Search Code', description: 'Search the codebase using natural language queries', type: 'core' as const },
  { name: 'find_references', displayName: 'Find References', description: 'Find symbol references across the project', type: 'core' as const },
  { name: 'run_command', displayName: 'Run Command', description: 'Execute shell commands in the project', type: 'core' as const },
  { name: 'get_project_overview', displayName: 'Project Overview', description: 'Get a structured map of project dependencies', type: 'core' as const },
  { name: 'memory_read', displayName: 'Memory Read', description: 'Read the full contents of a memory palace drawer', type: 'core' as const },
  { name: 'memory_write', displayName: 'Memory Write', description: 'Create or update a memory palace drawer', type: 'core' as const },
  { name: 'memory_search', displayName: 'Memory Search', description: 'Keyword search across all memory drawers', type: 'core' as const },
  { name: 'memory_list', displayName: 'Memory List', description: 'List the memory palace wing/room/drawer hierarchy', type: 'core' as const },
  { name: 'memory_delete', displayName: 'Memory Delete', description: 'Delete a memory palace drawer', type: 'core' as const },
  { name: 'list_emails', displayName: 'List Emails', description: 'List emails from inbox, spam, or quarantine', type: 'core' as const },
  { name: 'read_email', displayName: 'Read Email', description: 'Read the full sanitized body of an email by UID', type: 'core' as const },
  { name: 'move_email_to_folder', displayName: 'Move Email', description: 'Move an email to inbox, spam, or quarantine', type: 'core' as const },
  { name: 'delete_email', displayName: 'Delete Email', description: 'Permanently delete an email from the inbox', type: 'core' as const },
  { name: 'list_discord_channels', displayName: 'List Discord Channels', description: 'List all Discord channels the bot can access', type: 'core' as const },
  { name: 'read_discord_messages', displayName: 'Read Discord', description: 'Read recent messages from a Discord channel', type: 'core' as const },
  { name: 'send_discord_message', displayName: 'Send Discord', description: 'Send a message to a Discord channel', type: 'core' as const },
]

export async function readProjectSettings(rootPath: string): Promise<ProjectSettings> {
  try {
    const content = await readFile(prPath(rootPath, 'project-settings.json'), 'utf-8')
    return { ...DEFAULT_PROJECT_SETTINGS, ...JSON.parse(content) }
  } catch {
    return { ...DEFAULT_PROJECT_SETTINGS }
  }
}

export function registerProjectSettingsHandlers(): void {
  ipcMain.handle('project:getSettings', (_ev, rootPath: string) =>
    readProjectSettings(rootPath)
  )

  ipcMain.handle('project:setSettings', async (_ev, rootPath: string, patch: Partial<ProjectSettings>) => {
    const current = await readProjectSettings(rootPath)
    const updated = { ...current, ...patch }
    await writeFile(prPath(rootPath, 'project-settings.json'), JSON.stringify(updated, null, 2))
    return updated
  })

  ipcMain.handle('tools:list', async (_ev, rootPath: string) => {
    const pythonTools = await discoverPythonTools(rootPath)
    const pythonMeta = pythonTools.map((t) => ({
      name: t.name,
      displayName: t.name.replace(/^tool_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      description: t.description,
      type: 'python' as const
    }))
    return [...CORE_TOOL_META, ...pythonMeta]
  })
}
