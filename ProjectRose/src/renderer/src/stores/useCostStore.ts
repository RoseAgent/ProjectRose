import { create } from 'zustand'
import type { CostEntry } from '../../../shared/roseModelTypes'

interface CostState {
  entries: CostEntry[]
  loading: boolean
  load: (rootPath: string) => Promise<void>
  appendEntry: (entry: CostEntry) => void
}

export const useCostStore = create<CostState>()((set) => ({
  entries: [],
  loading: false,

  load: async (rootPath: string) => {
    set({ loading: true })
    try {
      const logs = await window.api.cost.getLogs(rootPath)
      set({ entries: logs })
    } finally {
      set({ loading: false })
    }
  },

  appendEntry: (entry: CostEntry) =>
    set((s) => ({ entries: [...s.entries, entry] }))
}))
