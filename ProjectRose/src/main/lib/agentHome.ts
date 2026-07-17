import { app } from 'electron'
import { join } from 'path'
import { mkdir, writeFile, access } from 'fs/promises'

export const AGENT_HOME_DIRNAME = '.rose'

export function agentHomePath(): string {
  return join(app.getPath('home'), AGENT_HOME_DIRNAME)
}

export function agentSettingsPath(): string {
  return join(agentHomePath(), 'settings.json')
}

export function agentRoseMdPath(): string {
  return join(agentHomePath(), 'ROSE.md')
}

export function recentWorkspacesPath(): string {
  return join(agentHomePath(), 'recent-workspaces.json')
}

export function agentExtensionsDir(): string {
  return join(agentHomePath(), 'extensions')
}

// Conversations live agent-global (not inside each Workspace) so the whole
// history can be listed and grouped in one scan. Layout mirrors Claude Code:
// <conversations>/<encoded-workspace>/<sessionId>/main.json.
export function conversationsDir(): string {
  return join(agentHomePath(), 'conversations')
}

export function agentExtensionInstallPath(extensionId: string): string {
  return join(agentExtensionsDir(), extensionId)
}

export function agentMemoryDir(): string {
  return join(agentHomePath(), 'memory')
}

export function memoryDiaryDir(): string {
  return join(agentMemoryDir(), 'diary')
}

export function memoryBehaviorRecordsDir(): string {
  return join(agentMemoryDir(), 'behavior-records')
}

export function memoryContactDir(): string {
  return join(agentMemoryDir(), 'contact')
}

export function memoryConversationsDir(): string {
  return join(agentMemoryDir(), 'conversations')
}

export function memoryAgentActivityDir(): string {
  return join(agentMemoryDir(), 'agent-activity')
}

export function memoryCalendarDir(): string {
  return join(agentMemoryDir(), 'calendar')
}

async function ensureKeepFile(dir: string): Promise<void> {
  const keep = join(dir, '.gitkeep')
  try {
    await access(keep)
  } catch {
    await writeFile(keep, '', 'utf-8').catch(() => { /* tolerate */ })
  }
}

export async function ensureAgentHome(): Promise<void> {
  await mkdir(agentExtensionsDir(), { recursive: true })
  // Memory subsystem dirs — the Agent's diary, directives, contacts, and the
  // per-day conversation + activity logs that feed the diary writer.
  const memoryDirs = [
    memoryDiaryDir(),
    memoryBehaviorRecordsDir(),
    memoryContactDir(),
    memoryConversationsDir(),
    memoryAgentActivityDir(),
    memoryCalendarDir()
  ]
  for (const d of memoryDirs) {
    await mkdir(d, { recursive: true })
    await ensureKeepFile(d)
  }
}
