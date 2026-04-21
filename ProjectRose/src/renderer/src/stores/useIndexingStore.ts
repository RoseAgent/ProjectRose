import { create } from 'zustand'

export interface IndexingProgressPayload {
  phase: string
  total: number
  completed: number
  message: string
}

type Phase = 'idle' | 'checking' | 'indexing' | 'done' | 'error'

interface IndexingState {
  phase: Phase
  total: number
  completed: number
  message: string
  visible: boolean
  setProgress: (p: IndexingProgressPayload) => void
  clear: () => void
}

// Module-level timer so repeated events always cancel the pending hide.
let hideTimer: ReturnType<typeof setTimeout> | null = null

const narrowPhase = (raw: string): Phase => {
  switch (raw) {
    case 'checking':
    case 'indexing':
    case 'done':
    case 'error':
    case 'idle':
      return raw
    default:
      return 'indexing'
  }
}

export const useIndexingStore = create<IndexingState>()((set) => ({
  phase: 'idle',
  total: 0,
  completed: 0,
  message: '',
  visible: false,
  setProgress: (p) => {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    const phase = narrowPhase(p.phase)
    set({
      phase,
      total: p.total,
      completed: p.completed,
      message: p.message,
      visible: true
    })
    if (phase === 'done') {
      hideTimer = setTimeout(() => {
        hideTimer = null
        set({ visible: false, phase: 'idle' })
      }, 2000)
    }
  },
  clear: () => {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    set({ phase: 'idle', total: 0, completed: 0, message: '', visible: false })
  }
}))
