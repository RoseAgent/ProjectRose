import type { ExternalSource } from './externalSession'

// The sidebar's data model: conversations grouped by the Workspace folder they
// belong to. Rose conversations and read-only External Sessions (Claude Code,
// Codex) interleave chronologically inside each group. Computed in the main
// process (one filesystem scan) and sent to the renderer as-is.

export type ConversationSource = 'rose' | ExternalSource

export interface ConversationListItem {
  source: ConversationSource
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface WorkspaceGroup {
  // Real absolute path (or, for external sessions with no recorded cwd, the
  // lossy decoded directory name — see `approximatePath`).
  workspacePath: string
  // Display label — the folder basename.
  name: string
  existsOnDisk: boolean
  approximatePath?: boolean
  // Max updatedAt across the group's items; drives group sort order.
  lastActivity: number
  // Interleaved, newest-first.
  items: ConversationListItem[]
}

export interface WorkspaceGroupedList {
  groups: WorkspaceGroup[] // sorted by lastActivity, newest-first
}

// A Workspace the app knows about — surfaced in the New Conversation picker and
// used to decide which always-on runtimes to start at boot.
export interface KnownWorkspace {
  path: string
  name: string
  lastActivity: number
  existsOnDisk: boolean
  sources: Array<'rose' | ExternalSource | 'recent'>
}
