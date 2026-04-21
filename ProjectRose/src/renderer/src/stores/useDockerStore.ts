import { create } from 'zustand'
import type { DockerContainer } from '../types/electron'

type DockerTab = 'logs' | 'inspect' | 'files'

interface LogAttachment {
  sessionId: string
  buffer: string[]
  cleanup: () => void
}

interface DockerState {
  rootPath: string | null
  dockerInstalled: boolean | null
  dockerVersion?: string
  composeFiles: string[]
  containers: DockerContainer[]
  selectedId: string | null
  activeTab: DockerTab
  logs: Record<string, LogAttachment>
  inspectCache: Record<string, unknown>
  loading: boolean
  error: string | null
  init: (rootPath: string) => Promise<void>
  refresh: () => Promise<void>
  select: (id: string | null) => void
  setTab: (tab: DockerTab) => void
  attachLogs: (id: string) => Promise<void>
  detachLogs: (id: string) => Promise<void>
  appendLog: (id: string, chunk: string) => void
  runAction: (id: string, action: 'start' | 'stop' | 'restart') => Promise<void>
  setInspect: (id: string, data: unknown) => void
}

const MAX_LOG_LINES = 5000

export const useDockerStore = create<DockerState>()((set, get) => ({
  rootPath: null,
  dockerInstalled: null,
  dockerVersion: undefined,
  composeFiles: [],
  containers: [],
  selectedId: null,
  activeTab: 'logs',
  logs: {},
  inspectCache: {},
  loading: false,
  error: null,

  init: async (rootPath: string) => {
    set({ rootPath, loading: true, error: null })
    try {
      const check = await window.api.docker.check()
      set({ dockerInstalled: check.installed, dockerVersion: check.version })
      if (!check.installed) {
        set({ composeFiles: [], containers: [], loading: false })
        return
      }
      const composeFiles = await window.api.docker.listCompose(rootPath)
      set({ composeFiles })
      if (composeFiles.length === 0) {
        set({ containers: [], loading: false })
        return
      }
      const containers = await window.api.docker.ps(composeFiles)
      set({ containers, loading: false })
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },

  refresh: async () => {
    const { rootPath, dockerInstalled, composeFiles } = get()
    if (!rootPath) return
    try {
      if (dockerInstalled === null) {
        const check = await window.api.docker.check()
        set({ dockerInstalled: check.installed, dockerVersion: check.version })
        if (!check.installed) return
      } else if (dockerInstalled === false) {
        return
      }
      const files = composeFiles.length > 0
        ? composeFiles
        : await window.api.docker.listCompose(rootPath)
      if (files !== composeFiles) set({ composeFiles: files })
      if (files.length === 0) {
        set({ containers: [] })
        return
      }
      const containers = await window.api.docker.ps(files)
      set({ containers, error: null })
    } catch (err) {
      set({ error: String(err) })
    }
  },

  select: (id) => {
    set({ selectedId: id })
  },

  setTab: (tab) => set({ activeTab: tab }),

  attachLogs: async (id: string) => {
    const existing = get().logs[id]
    if (existing) return
    const sessionId = await window.api.docker.subscribeLogs(id, { tail: 500 })
    const cleanup = window.api.docker.onLogsData((payload) => {
      if (payload.sessionId !== sessionId) return
      get().appendLog(id, payload.chunk)
    })
    set((state) => ({
      logs: {
        ...state.logs,
        [id]: { sessionId, buffer: [], cleanup }
      }
    }))
  },

  detachLogs: async (id: string) => {
    const entry = get().logs[id]
    if (!entry) return
    try { entry.cleanup() } catch {}
    try { await window.api.docker.unsubscribeLogs(entry.sessionId) } catch {}
    set((state) => {
      const next = { ...state.logs }
      delete next[id]
      return { logs: next }
    })
  },

  appendLog: (id, chunk) => {
    set((state) => {
      const entry = state.logs[id]
      if (!entry) return state
      const nextBuffer = entry.buffer.concat(chunk)
      if (nextBuffer.length > MAX_LOG_LINES) {
        nextBuffer.splice(0, nextBuffer.length - MAX_LOG_LINES)
      }
      return {
        logs: {
          ...state.logs,
          [id]: { ...entry, buffer: nextBuffer }
        }
      }
    })
  },

  runAction: async (id, action) => {
    set({ loading: true })
    try {
      const result = action === 'start'
        ? await window.api.docker.start(id)
        : action === 'stop'
          ? await window.api.docker.stop(id)
          : await window.api.docker.restart(id)
      if (!result.ok) set({ error: result.error ?? `docker ${action} failed` })
      await get().refresh()
    } finally {
      set({ loading: false })
    }
  },

  setInspect: (id, data) => {
    set((state) => ({ inspectCache: { ...state.inspectCache, [id]: data } }))
  }
}))
