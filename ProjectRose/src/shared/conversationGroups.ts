// The sidebar's data model: conversations grouped by the Workspace folder they
// belong to. Computed in the main process (one filesystem scan) and sent to
// the renderer as-is.

export interface ConversationListItem {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface WorkspaceGroup {
  // Real absolute path of the Workspace folder.
  workspacePath: string
  // Display label — the folder basename.
  name: string
  existsOnDisk: boolean
  // Max updatedAt across the group's items; drives group sort order.
  lastActivity: number
  // Newest-first.
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
}
