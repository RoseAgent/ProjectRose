import { promises as fs } from 'fs'
import { basename } from 'path'
import { listAllConversations } from './conversationStore'
import { listExternalSessions } from './externalSessions'
import { getRecentProjects } from './recentProjects'
import type {
  ConversationListItem,
  KnownWorkspace,
  WorkspaceGroup,
  WorkspaceGroupedList
} from '../../shared/conversationGroups'
import type { ExternalSource } from '../../shared/externalSession'

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
  approximate: boolean
  items: ConversationListItem[]
}

// Build the grouped sidebar list: Rose conversations + external sessions,
// grouped by Workspace, interleaved chronologically, groups newest-first.
export async function buildWorkspaceGroupedList(): Promise<WorkspaceGroupedList> {
  const [rose, external] = await Promise.all([listAllConversations(), listExternalSessions()])

  const accs = new Map<string, GroupAcc>()

  const keyFor = (workspacePath: string, approximate: boolean, source: string): string =>
    // Approximate (cwd-less) external groups can't be trusted to equal a real
    // path, so keep each isolated rather than merging into a real group.
    approximate ? `approx:${source}:${workspacePath}` : pathKey(workspacePath)

  const push = (
    workspacePath: string,
    approximate: boolean,
    item: ConversationListItem
  ): void => {
    const k = keyFor(workspacePath, approximate, item.source)
    let acc = accs.get(k)
    if (!acc) {
      acc = { workspacePath, approximate, items: [] }
      accs.set(k, acc)
    }
    acc.items.push(item)
  }

  for (const m of rose) {
    push(m.workspacePath, false, {
      source: 'rose',
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt
    })
  }
  for (const m of external) {
    push(m.workspacePath, m.approximatePath === true, {
      source: m.source,
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
      existsOnDisk: acc.approximate ? false : await existsDir(acc.workspacePath),
      approximatePath: acc.approximate || undefined,
      lastActivity,
      items: acc.items
    })
  }

  groups.sort((a, b) => b.lastActivity - a.lastActivity)
  return { groups }
}

// Every Workspace the app knows about — union of conversation groups, external
// session cwds, and recents. Feeds the New Conversation picker and the
// always-on runtime boot. Sorted most-recent-first.
export async function listKnownWorkspaces(): Promise<KnownWorkspace[]> {
  const { groups } = await buildWorkspaceGroupedList()
  const byKey = new Map<string, KnownWorkspace>()

  const add = (
    path: string,
    lastActivity: number,
    source: KnownWorkspace['sources'][number],
    existsOnDisk?: boolean
  ): void => {
    const k = pathKey(path)
    const existing = byKey.get(k)
    if (existing) {
      existing.lastActivity = Math.max(existing.lastActivity, lastActivity)
      if (!existing.sources.includes(source)) existing.sources.push(source)
      return
    }
    byKey.set(k, {
      path,
      name: displayName(path),
      lastActivity,
      existsOnDisk: existsOnDisk ?? false,
      sources: [source]
    })
  }

  for (const g of groups) {
    if (g.approximatePath) continue // not a usable real path
    // Attribute the group's sources from its items.
    const sources = new Set<'rose' | ExternalSource>(g.items.map((i) => i.source))
    for (const s of sources) add(g.workspacePath, g.lastActivity, s, g.existsOnDisk)
  }

  // Recents may include workspaces with no conversations yet.
  for (const r of getRecentProjects()) {
    add(r.path, r.lastOpened, 'recent')
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
