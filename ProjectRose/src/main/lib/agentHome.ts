import { app } from 'electron'
import { join } from 'path'
import { mkdir, writeFile, access, rename, rm, readdir, stat } from 'fs/promises'

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

// Contacts and Events are agent-global records at ~/.rose/contact/ and
// ~/.rose/calendar/. They used to live under ~/.rose/memory/ as part of the
// retired host-memory subsystem — see ADR 0019. The `memory` path is reserved
// for the future memory system and must stay unclaimed.
export function agentContactDir(): string {
  return join(agentHomePath(), 'contact')
}

export function agentCalendarDir(): string {
  return join(agentHomePath(), 'calendar')
}

async function ensureKeepFile(dir: string): Promise<void> {
  const keep = join(dir, '.gitkeep')
  try {
    await access(keep)
  } catch {
    await writeFile(keep, '', 'utf-8').catch(() => { /* tolerate */ })
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * One-shot retirement of ~/.rose/memory/ (ADR 0019). Relocates the surviving
 * concept dirs (contact/, calendar/) up to ~/.rose/, then deletes the rest of
 * the memory tree — diary, behavior-records, and the conversation/activity
 * feeder logs are gone for good, and the emptied ~/.rose/memory/ directory is
 * removed so the path is virgin for the future memory system.
 *
 * Idempotent: a no-op once ~/.rose/memory/ no longer exists. The delete only
 * runs after both survivors are safely out, so a partial earlier run can never
 * cost contact or calendar data.
 */
export async function retireLegacyMemoryDir(): Promise<void> {
  const legacyRoot = join(agentHomePath(), 'memory')
  if (!(await exists(legacyRoot))) return

  const relocations: Array<{ from: string; to: string }> = [
    { from: join(legacyRoot, 'contact'), to: agentContactDir() },
    { from: join(legacyRoot, 'calendar'), to: agentCalendarDir() }
  ]
  for (const { from, to } of relocations) {
    if (!(await exists(from))) continue
    if (!(await exists(to))) {
      await rename(from, to)
      continue
    }
    // Target already scaffolded (e.g. a previous partial run) — move entries
    // across one by one, never overwriting, then drop the emptied source.
    await moveEntries(from, to)
    await rm(from, { recursive: true, force: true })
  }

  await rm(legacyRoot, { recursive: true, force: true })
}

async function moveEntries(fromDir: string, toDir: string): Promise<void> {
  const entries = await readdir(fromDir)
  for (const entry of entries) {
    const src = join(fromDir, entry)
    const dst = join(toDir, entry)
    if (await exists(dst)) {
      // Same name on both sides: recurse into directories, keep the
      // already-relocated file otherwise.
      const info = await stat(src)
      if (info.isDirectory()) await moveEntries(src, dst)
      continue
    }
    await rename(src, dst)
  }
}

export async function ensureAgentHome(): Promise<void> {
  await mkdir(agentExtensionsDir(), { recursive: true })
  // Retire the legacy ~/.rose/memory/ tree before scaffolding, so the
  // contact/calendar relocation can use a plain rename.
  await retireLegacyMemoryDir().catch(() => { /* retry next launch */ })
  for (const d of [agentContactDir(), agentCalendarDir()]) {
    await mkdir(d, { recursive: true })
    await ensureKeepFile(d)
  }
}
