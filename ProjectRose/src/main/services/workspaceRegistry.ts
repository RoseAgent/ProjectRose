import { promises as fs } from 'fs'
import { basename } from 'path'
import { listAllConversations } from './conversationStore'
import { getRecentProjects } from './recentProjects'
import type {
  ConversationListItem,
  KnownWorkspace,
  WorkspaceGroup,
  WorkspaceGroupedList
} from '../../shared/conversationGroups'

// Canonical dedupe key for a workspace path (case-insensitive on win32).
function pathKey(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed
}

function displayName(p: string): string {
  return basename(p.replace(/[\\/]+$/, '')) || p
}

async function existsDir(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p)
    return s.isDirectory()
  } catch {
    return false
  }
}

interface GroupAcc {
  workspacePath: string
  items: ConversationListItem[]
}

// Build the grouped sidebar list: conversations grouped by Workspace,
// interleaved chronologically, groups newest-first.
export async function buildWorkspaceGroupedList(): Promise<WorkspaceGroupedList> {
  const conversations = await listAllConversations()

  const accs = new Map<string, GroupAcc>()
  for (const m of conversations) {
    const k = pathKey(m.workspacePath)
    let acc = accs.get(k)
    if (!acc) {
      acc = { workspacePath: m.workspacePath, items: [] }
      accs.set(k, acc)
    }
    acc.items.push({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt
    })
  }

  const groups: WorkspaceGroup[] = []
  for (const acc of accs.values()) {
    acc.items.sort((a, b) => b.updatedAt - a.updatedAt)
    const lastActivity = acc.items.reduce((max, i) => Math.max(max, i.updatedAt), 0)
    groups.push({
      workspacePath: acc.workspacePath,
      name: displayName(acc.workspacePath),
      existsOnDisk: await existsDir(acc.workspacePath),
      lastActivity,
      items: acc.items
    })
  }

  groups.sort((a, b) => b.lastActivity - a.lastActivity)
  return { groups }
}

// Every Workspace the app knows about — union of conversation groups and
// recents. Feeds the New Conversation picker and the always-on runtime boot.
// Sorted most-recent-first.
export async function listKnownWorkspaces(): Promise<KnownWorkspace[]> {
  const { groups } = await buildWorkspaceGroupedList()
  const byKey = new Map<string, KnownWorkspace>()

  const add = (
    path: string,
    lastActivity: number,
    existsOnDisk?: boolean
  ): void => {
    const k = pathKey(path)
    const existing = byKey.get(k)
    if (existing) {
      existing.lastActivity = Math.max(existing.lastActivity, lastActivity)
      return
    }
    byKey.set(k, {
      path,
      name: displayName(path),
      lastActivity,
      existsOnDisk: existsOnDisk ?? false
    })
  }

  for (const g of groups) {
    add(g.workspacePath, g.lastActivity, g.existsOnDisk)
  }

  // Recents may include workspaces with no conversations yet.
  for (const r of getRecentProjects()) {
    add(r.path, r.lastOpened)
  }

  // Resolve existsOnDisk for recent-only entries that groups didn't already stat.
  const result = [...byKey.values()]
  await Promise.all(
    result.map(async (w) => {
      if (!w.existsOnDisk) w.existsOnDisk = await existsDir(w.path)
    })
  )

  return result.sort((a, b) => b.lastActivity - a.lastActivity)
}
