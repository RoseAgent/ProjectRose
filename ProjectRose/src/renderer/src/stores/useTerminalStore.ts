import { create } from 'zustand'

interface TerminalState {
  sessionId: string | null
  // A command to type into the terminal as soon as a session is ready. Set by
  // "Open in Claude" (and consumed one-shot by TerminalPanel). Survives the
  // dispose+respawn that re-roots the terminal at a new cwd.
  pendingCommand: string | null
  initialize: (cwd?: string) => Promise<void>
  dispose: () => Promise<void>
  setPendingCommand: (command: string | null) => void
}

// Bumped on every initialize/dispose so an in-flight spawn whose caller is
// already gone (e.g. StrictMode double-mount in dev) can't leak a live pty.
let generation = 0

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  sessionId: null,
  pendingCommand: null,

  setPendingCommand: (pendingCommand) => set({ pendingCommand }),

  initialize: async (cwd?: string) => {
    const myGen = ++generation

    const old = get().sessionId
    if (old) {
      set({ sessionId: null })
      try { await window.api.disposeTerminal(old) } catch {}
    }

    let sessionId: string
    try {
      sessionId = await window.api.spawnTerminal(cwd ? { cwd } : undefined)
    } catch (err) {
      console.error('Failed to spawn terminal:', err)
      if (myGen === generation) set({ sessionId: null })
      return
    }

    if (myGen !== generation) {
      // A newer initialize/dispose has superseded us — kill this orphan.
      try { await window.api.disposeTerminal(sessionId) } catch {}
      return
    }
    set({ sessionId })
  },

  dispose: async () => {
    generation++
    const { sessionId } = get()
    if (sessionId) {
      set({ sessionId: null })
      try { await window.api.disposeTerminal(sessionId) } catch {}
    }
  }
}))
