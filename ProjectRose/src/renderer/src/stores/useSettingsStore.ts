import { create } from 'zustand'
import { NavItem } from '../../../shared/types'
import type { ModelConfig, RouterConfig, CompressionConfig } from '../types/electron'
import { useProjectStore } from './useProjectStore'

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { viewId: 'chat',      label: 'Chat',      visible: true },
  { viewId: 'editor',    label: 'Editor',    visible: true },
  { viewId: 'heartbeat', label: 'Heartbeat', visible: true },
  { viewId: 'settings',  label: 'Settings',  visible: true },
]

interface SettingsState {
  heartbeatEnabled: boolean
  heartbeatIntervalMinutes: number
  micDeviceId: string
  userName: string
  agentName: string
  roseSpeechSpeakerId: number | null
  activeListeningSetupComplete: boolean
  imapHost: string
  imapPort: number
  imapUser: string
  imapPassword: string
  imapTLS: boolean
  discordBotToken: string
  discordChannels: string[]
  navItems: NavItem[]
  models: ModelConfig[]
  defaultModelId: string
  providerKeys: { anthropic: string; openai: string; bedrock: { region: string; accessKeyId: string; secretAccessKey: string } }
  router: RouterConfig
  compression: CompressionConfig
  extensions: Record<string, Record<string, unknown>>
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
  imapHost: '',
  imapPort: 993,
  imapUser: '',
  imapPassword: '',
  imapTLS: true,
  discordBotToken: '',
  discordChannels: [],
  navItems: DEFAULT_NAV_ITEMS,
  models: [],
  defaultModelId: '',
  providerKeys: { anthropic: '', openai: '', bedrock: { region: 'us-east-1', accessKeyId: '', secretAccessKey: '' } },
  router: { enabled: false, modelName: '', baseUrl: 'http://localhost:11434' },
  compression: { provider: 'anthropic', modelName: '', baseUrl: '' },
  extensions: {},
  loaded: false,

  load: async () => {
    const rootPath = useProjectStore.getState().rootPath ?? undefined
    const s = await window.api.getSettings(rootPath)
    set({ ...s, loaded: true })
  },

  update: async (patch) => {
    const rootPath = useProjectStore.getState().rootPath ?? undefined
    const s = await window.api.setSettings(patch, rootPath)
    set(s)
  }
}))
