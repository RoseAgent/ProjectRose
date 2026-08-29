import { create } from 'zustand'

interface TerminalState {
  sessionId: string | null
  // Spawn (or re-root: dispose+respawn) the single pty session. There is no
  // renderer-side teardown — the session runs in the background until the
  // next re-root, and main reaps all ptys on app quit.
  initialize: (cwd?: string) => Promise<void>
}

// Bumped on every initialize so an in-flight spawn whose caller has been
// superseded (e.g. two rapid re-roots) can't leak a live pty.
let generation = 0

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  sessionId: null,

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
  }
}))
