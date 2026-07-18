import { create } from 'zustand'
import { useProjectStore } from './useProjectStore'
import { useStatusStore } from './useStatusStore'
import { DEFAULT_TTS_SETTINGS, type TtsSettings } from '@shared/tts'
import type { ModelConfig } from '@shared/modelConfig'

interface SettingsState {
  micDeviceId: string
  userName: string
  agentName: string
  roseSpeechSpeakerId: number | null
  activeListeningSetupComplete: boolean
  activeListeningDraftSeconds: number
  whisperModel: string
  lastMainView: 'bloom' | 'editor'
  ollamaBaseUrl: string
  kimiAuthMethod: 'oauth' | 'apikey'
  // Most recent composer pick — seeds the ModelPicker for new Conversations.
  // Written by the picker, never by the Settings page.
  lastModel: ModelConfig | null
  extensions: Record<string, Record<string, unknown>>
  tts: TtsSettings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<Omit<SettingsState, 'loaded' | 'load' | 'update'>>) => Promise<void>
}

// Prevents a stale rootPath-less load from overwriting a newer rootPath-specific load.
let loadGeneration = 0

// Debounces "Settings saved" notifications across rapid update() bursts (e.g. typing in a text field).
let saveNotifyTimer: ReturnType<typeof setTimeout> | null = null

export const useSettingsStore = create<SettingsState>()((set) => ({
  micDeviceId: '',
  userName: '',
  agentName: 'Rose',
  roseSpeechSpeakerId: null,
  activeListeningSetupComplete: false,
  activeListeningDraftSeconds: 8,
  whisperModel: 'Xenova/whisper-tiny.en',
  lastMainView: 'bloom',
  ollamaBaseUrl: 'http://localhost:11434',
  kimiAuthMethod: 'oauth',
  lastModel: null,
  extensions: {},
  tts: DEFAULT_TTS_SETTINGS,
  loaded: false,

  load: async () => {
    const gen = ++loadGeneration
    set({ loaded: false })
    const rootPath = useProjectStore.getState().rootPath ?? undefined
    const s = await window.api.getSettings(rootPath)
    if (gen !== loadGeneration) return
    // Settings are agent-global; rootPath is passed for back-compat but
    // ignored by the host. Mark loaded regardless so the WelcomeView and
    // Settings panel work without a workspace open.
    set({ ...s, loaded: true })
  },

  update: async (patch) => {
    set(patch as Partial<SettingsState>)
    const rootPath = useProjectStore.getState().rootPath ?? undefined
    const s = await window.api.setSettings(patch, rootPath)
    set({ ...s })
    // lastModel is bookkeeping written on every composer pick — a "Settings
    // saved" toast for it would be pure noise.
    const keys = Object.keys(patch)
    if (keys.length === 1 && keys[0] === 'lastModel') return
    if (saveNotifyTimer) clearTimeout(saveNotifyTimer)
    saveNotifyTimer = setTimeout(() => {
      useStatusStore.getState().notify('Settings saved', { tone: 'success' })
      saveNotifyTimer = null
    }, 500)
  }
}))
