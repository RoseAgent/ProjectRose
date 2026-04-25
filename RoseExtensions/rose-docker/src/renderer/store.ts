import { create } from 'zustand'

export interface DockerContainer {
  id: string
  name: string
  image: string
  service?: string
  composeFile?: string
  state: string
  status: string
  ports: string
  createdAt: string
}

export interface DockerMount {
  Source: string
  Destination: string
  Type: string
}

export interface DockerDirEntry {
  name: string
  type: 'file' | 'dir' | 'link' | 'other'
  size: number
}

interface LogEntry {
  sessionId: string
  buffer: string[]
}

interface DockerState {
  dockerInstalled: boolean | null
  composeFiles: string[]
  containers: DockerContainer[]
  selectedId: string | null
  activeTab: 'logs' | 'inspect' | 'files'
  loading: boolean
  error: string | null
  inspectCache: Record<string, unknown>
  logs: Record<string, LogEntry>

  init: (rootPath: string) => Promise<void>
  refresh: () => Promise<void>
  select: (id: string) => void
  setTab: (tab: 'logs' | 'inspect' | 'files') => void
  runAction: (id: string, action: 'start' | 'stop' | 'restart') => Promise<void>
  attachLogs: (containerId: string) => Promise<void>
  detachLogs: (containerId: string) => Promise<void>
  setInspect: (containerId: string, data: unknown) => void
}

export const useDockerStore = create<DockerState>((set, get) => ({
  dockerInstalled: null,
  composeFiles: [],
  containers: [],
  selectedId: null,
  activeTab: 'logs',
  loading: false,
  error: null,
  inspectCache: {},
  logs: {},

  init: async (rootPath: string) => {
    set({ error: null })

    const checkResult = await window.api.invoke('rose-docker:check') as { installed: boolean; version?: string }
    if (!checkResult.installed) {
      set({ dockerInstalled: false })
      return
    }
    set({ dockerInstalled: true })

    const composeFiles = await window.api.invoke('rose-docker:listCompose', rootPath) as string[]
    set({ composeFiles })

    if (composeFiles.length === 0) return

    const containers = await window.api.invoke('rose-docker:listContainers', composeFiles) as DockerContainer[]
    set({ containers })

    const { selectedId } = get()
    if (!selectedId && containers.length > 0) {
      set({ selectedId: containers[0].id })
    }
  },

  refresh: async () => {
    const { composeFiles } = get()
    if (composeFiles.length === 0) return
    try {
      const containers = await window.api.invoke('rose-docker:listContainers', composeFiles) as DockerContainer[]
      set({ containers })
    } catch (err) {
      console.error('rose-docker: refresh failed', err)
    }
  },

  select: (id: string) => {
    set({ selectedId: id, activeTab: 'logs', error: null })
  },

  setTab: (tab: 'logs' | 'inspect' | 'files') => {
    set({ activeTab: tab })
  },

  runAction: async (id: string, action: 'start' | 'stop' | 'restart') => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.invoke(`rose-docker:${action}`, id) as { ok: boolean; error?: string }
      if (!result.ok) {
        set({ error: result.error ?? `${action} failed` })
      }
    } catch (err) {
      set({ error: String(err) })
    } finally {
      set({ loading: false })
      await get().refresh()
    }
  },

  attachLogs: async (containerId: string) => {
    const result = await window.api.invoke('rose-docker:subscribeLogs', containerId, 500) as { sessionId: string }
    const { sessionId } = result
    set((state) => ({
      logs: {
        ...state.logs,
        [containerId]: { sessionId, buffer: [] }
      }
    }))
  },

  detachLogs: async (containerId: string) => {
    const { logs } = get()
    const entry = logs[containerId]
    if (!entry) return
    await window.api.invoke('rose-docker:unsubscribeLogs', entry.sessionId)
    set((state) => {
      const next = { ...state.logs }
      delete next[containerId]
      return { logs: next }
    })
  },

  setInspect: (containerId: string, data: unknown) => {
    set((state) => ({
      inspectCache: { ...state.inspectCache, [containerId]: data }
    }))
  }
}))
