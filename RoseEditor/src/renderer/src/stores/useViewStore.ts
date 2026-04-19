import { create } from 'zustand'

type ActiveView = 'editor' | 'chat' | 'docker' | 'git' | 'heartbeat'

interface ViewState {
  activeView: ActiveView
  sidebarWidth: number
  terminalHeight: number
  isTerminalVisible: boolean
  setActiveView: (view: ActiveView) => void
  setSidebarWidth: (width: number) => void
  setTerminalHeight: (height: number) => void
  toggleTerminal: () => void
}

export const useViewStore = create<ViewState>()((set) => ({
  activeView: 'chat',
  sidebarWidth: 240,
  terminalHeight: 200,
  isTerminalVisible: true,
  setActiveView: (view) => set({ activeView: view }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setTerminalHeight: (height) => set({ terminalHeight: height }),
  toggleTerminal: () => set((s) => ({ isTerminalVisible: !s.isTerminalVisible }))
}))
