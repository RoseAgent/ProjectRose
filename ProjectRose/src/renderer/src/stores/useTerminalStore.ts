import { create } from 'zustand'

interface TerminalState {
  sessionId: string | null
  // A command to type into the terminal as soon as a session is ready. Set by
  // the external-session resume flow and consumed one-shot by initialize()
  // right after the spawn — the pty runs and receives the command even while
  // the editor view (and its TerminalPanel) has never been shown. Survives a
  // dispose+respawn that re-roots the terminal at a new cwd.
  pendingCommand: string | null
  // Spawn (or re-root: dispose+respawn) the single pty session. There is no
  // renderer-side teardown — the session runs in the background until the
  // next re-root, and main reaps all ptys on app quit.
  initialize: (cwd?: string) => Promise<void>
  setPendingCommand: (command: string | null) => void
}

// Bumped on every initialize so an in-flight spawn whose caller has been
// superseded (e.g. two rapid re-roots) can't leak a live pty.
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

    // Type the queued command once the shell has had a moment to print its
    // prompt. Cleared only when it actually fires, and only if this session is
    // still the active one — a superseding respawn carries it forward.
    const pending = get().pendingCommand
    if (pending) {
      setTimeout(() => {
        if (get().sessionId === sessionId && get().pendingCommand === pending) {
          window.api.writeTerminal(sessionId, `${pending}\r`)
          set({ pendingCommand: null })
        }
      }, 400)
    }
  }
}))
