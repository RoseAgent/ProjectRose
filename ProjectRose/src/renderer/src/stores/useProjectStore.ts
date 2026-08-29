import { create } from 'zustand'
import type { FileNode, RecentProject } from '@shared/types'

interface ProjectState {
  rootPath: string | null
  // True when the active conversation's Workspace folder can't be read from
  // disk. The conversation still loads (its data lives in the agent home), but
  // file/terminal tools are unavailable until the folder is restored.
  workspaceMissing: boolean
  fileTree: FileNode | null
  expandedDirs: Set<string>
  recentProjects: RecentProject[]
  loadRecentProjects: () => Promise<void>
  // Bind the active Workspace to `path`. Selecting a conversation drives this;
  // there is no app-level "open workspace" independent of conversations.
  // Cheap-switch guard: rebinding the same path is a no-op.
  bindWorkspace: (path: string) => Promise<void>
  removeRecent: (path: string) => Promise<void>
  refreshTree: () => Promise<void>
  toggleDirExpanded: (path: string) => void
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  rootPath: null,
  workspaceMissing: false,
  fileTree: null,
  expandedDirs: new Set<string>(),
  recentProjects: [],

  loadRecentProjects: async () => {
    const projects = await window.api.getRecentProjects()
    set({ recentProjects: projects })
  },

  bindWorkspace: async (path: string) => {
    // Same-workspace conversation switches must be instant: no tree rebuild,
    // no LSP re-index, no recents churn.
    if (get().rootPath === path && !get().workspaceMissing) return

    let tree: FileNode | null = null
    let missing = false
    try {
      tree = await window.api.readDirectoryTree(path)
    } catch {
      missing = true
    }

    if (missing) {
      // Keep the workspace bound so the conversation stays viewable; tools that
      // need the folder guard on `workspaceMissing`.
      set({ rootPath: path, workspaceMissing: true, fileTree: null })
      return
    }

    const projects = await window.api.addRecentProject(path)
    set({ recentProjects: projects })
    // Start LSP servers for this workspace.
    window.api.indexProject(path).catch(() => {})

    set({
      rootPath: path,
      workspaceMissing: false,
      fileTree: tree,
      expandedDirs: new Set<string>([path])
    })
  },

  removeRecent: async (path: string) => {
    const projects = await window.api.removeRecentProject(path)
    set({ recentProjects: projects })
  },

  refreshTree: async () => {
    const { rootPath } = get()
    if (!rootPath) return
    try {
      const tree = await window.api.readDirectoryTree(rootPath)
      set({ fileTree: tree, workspaceMissing: false })
    } catch {
      set({ fileTree: null, workspaceMissing: true })
    }
  },

  toggleDirExpanded: (path: string) => {
    set((state) => {
      const next = new Set(state.expandedDirs)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return { expandedDirs: next }
    })
  }
}))
