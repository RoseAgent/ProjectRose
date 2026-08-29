import { create } from 'zustand'
import { ActiveView } from '../../../shared/types'
import { logInteraction } from '../lib/interactionLog'

interface ViewState {
  activeView: ActiveView
  sidebarWidth: number
  terminalHeight: number
  isTerminalVisible: boolean
  isChatFullWidth: boolean
  settingsTarget: string | null
  setActiveView: (view: ActiveView) => void
  setSidebarWidth: (width: number) => void
  setTerminalHeight: (height: number) => void
  toggleTerminal: () => void
  toggleChatFullWidth: () => void
  setSettingsTarget: (target: string | null) => void
}

// ActiveView is BaseView ('editor' | 'chat' | 'settings') | extension id.
// Any other string is an extension id.
const BASE_VIEWS = new Set(['editor', 'chat', 'settings'])

export const useViewStore = create<ViewState>()((set, get) => ({
  activeView: 'chat',
  sidebarWidth: 240,
  terminalHeight: 200,
  isTerminalVisible: true,
  // The app boots into the chat view, which is always full screen on entry
  // (see setActiveView) — seed the flag to match.
  isChatFullWidth: true,
  settingsTarget: null,
  setActiveView: (view) => {
    if (get().activeView !== view) {
      if (BASE_VIEWS.has(view)) {
        logInteraction('view.changed', view)
      } else {
        logInteraction('extension.opened', view)
      }
    }
    // The full-width flag follows the view rather than surviving switches:
    // - Entering the editor collapses an expanded chat. App.tsx hides the
    //   whole editor pane while `activeView === 'editor' && isChatFullWidth`,
    //   and the collapse toggle only renders in chat view — a stale expanded
    //   flag would leave the user on a full-screen chat with no way back.
    // - Returning to the bloom (chat) view always re-expands to full screen;
    //   the header toggle still collapses it to reveal the BloomStage.
    if (view === 'editor') {
      set({ activeView: view, isChatFullWidth: false })
      return
    }
    if (view === 'chat') {
      set({ activeView: view, isChatFullWidth: true })
      return
    }
    set({ activeView: view })
  },
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setTerminalHeight: (height) => set({ terminalHeight: height }),
  toggleTerminal: () => {
    logInteraction('view.terminal-toggled')
    set((s) => ({ isTerminalVisible: !s.isTerminalVisible }))
  },
  toggleChatFullWidth: () => {
    logInteraction('view.chat-toggled')
    set((s) => ({ isChatFullWidth: !s.isChatFullWidth }))
  },
  setSettingsTarget: (target) => set({ settingsTarget: target })
}))
