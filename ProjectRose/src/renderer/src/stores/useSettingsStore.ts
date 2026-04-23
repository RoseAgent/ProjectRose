import { create } from 'zustand'
import { NavItem } from '../../../shared/types'
import type { ModelConfig, RouterConfig } from '../types/electron'
import { useProjectStore } from './useProjectStore'

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { viewId: 'chat',      label: 'Agent',     visible: true },
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
  providerKeys: { anthropic: string; openai: string; bedrock: { region: string; accessKeyId: string; secretAccessKey: string }; projectrose: { accessToken: string; refreshToken: string; email: string; plan: string } | null }
  router: RouterConfig
  hostMode: 'projectrose' | 'self'
  extensions: Record<string, Record<string, unknown>>
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<Omit<SettingsState, 'loaded' | 'load' | 'update'>>) => Promise<void>
}

// Prevents a stale rootPath-less load from overwriting a newer rootPath-specific load.
let loadGeneration = 0

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
  providerKeys: { anthropic: '', openai: '', bedrock: { region: 'us-east-1', accessKeyId: '', secretAccessKey: '' }, projectrose: null },
  router: { enabled: false, modelName: '', baseUrl: 'http://localhost:11434' },
  hostMode: 'projectrose',
  extensions: {},
  loaded: false,

  load: async () => {
    const gen = ++loadGeneration
    set({ loaded: false })
    const rootPath = useProjectStore.getState().rootPath ?? undefined
    const s = await window.api.getSettings(rootPath)
    if (gen !== loadGeneration) return
    const navItems = DEFAULT_NAV_ITEMS.map((def) => {
      const persisted = (s.navItems as NavItem[] | undefined)?.find((n) => n.viewId === def.viewId)
      return persisted ? { ...persisted, label: def.label } : def
    })
    // Only mark loaded:true once we have a project rootPath.
    // A rootPath-less load returns global defaults (heartbeatEnabled:true) which
    // must not unblock the heartbeat before the project-specific settings arrive.
    set({ ...s, navItems, loaded: rootPath !== undefined })
  },

  update: async (patch) => {
    const rootPath = useProjectStore.getState().rootPath ?? undefined
    const s = await window.api.setSettings(patch, rootPath)
    const navItems = DEFAULT_NAV_ITEMS.map((def) => {
      const persisted = (s.navItems as NavItem[] | undefined)?.find((n) => n.viewId === def.viewId)
      return persisted ? { ...persisted, label: def.label } : def
    })
    set({ ...s, navItems })
  }
}))
