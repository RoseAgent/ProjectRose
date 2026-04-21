import { create } from 'zustand'
import type { FileNode } from '../../../shared/types'
import type { RecentProject } from '../types/electron'

interface ProjectState {
  rootPath: string | null
  fileTree: FileNode | null
  expandedDirs: Set<string>
  recentProjects: RecentProject[]
  loadRecentProjects: () => Promise<void>
  openFolder: (path: string) => Promise<void>
  removeRecent: (path: string) => Promise<void>
  refreshTree: () => Promise<void>
  toggleDirExpanded: (path: string) => void
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  rootPath: null,
  fileTree: null,
  expandedDirs: new Set<string>(),
  recentProjects: [],

  loadRecentProjects: async () => {
    const projects = await window.api.getRecentProjects()
    set({ recentProjects: projects })
  },

  openFolder: async (path: string) => {
    const tree = await window.api.readDirectoryTree(path)
    const projects = await window.api.addRecentProject(path)
    set({
      rootPath: path,
      fileTree: tree,
      expandedDirs: new Set<string>([path]),
      recentProjects: projects
    })

    // Start LSP servers for this project
    window.api.indexProject(path).catch(() => {})
  },

  removeRecent: async (path: string) => {
    const projects = await window.api.removeRecentProject(path)
    set({ recentProjects: projects })
  },

  refreshTree: async () => {
    const { rootPath } = get()
    if (!rootPath) return
    const tree = await window.api.readDirectoryTree(rootPath)
    set({ fileTree: tree })
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
