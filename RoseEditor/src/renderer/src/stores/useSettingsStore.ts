import { create } from 'zustand'

interface SettingsState {
  heartbeatEnabled: boolean
  heartbeatIntervalMinutes: number
  micDeviceId: string
  userName: string
  agentName: string
  roseSpeechSpeakerId: number | null
  activeListeningSetupComplete: boolean
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<Omit<SettingsState, 'loaded' | 'load' | 'update'>>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  heartbeatEnabled: true,
  heartbeatIntervalMinutes: 5,
  micDeviceId: '',
  userName: '',
  agentName: '',
  roseSpeechSpeakerId: null,
  activeListeningSetupComplete: false,
  loaded: false,

  load: async () => {
    const s = await window.api.getSettings()
    set({ ...s, loaded: true })
  },

  update: async (patch) => {
    const s = await window.api.setSettings(patch)
    set(s)
  }
}))
