import { ipcMain, app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { get as httpGet } from 'http'
import { IPC } from '../../shared/ipcChannels'
import { NavItem } from '../../shared/types'

export interface ModelConfig {
  id: string
  displayName: string
  provider: 'anthropic' | 'openai' | 'ollama' | 'openai-compatible' | 'bedrock'
  modelName: string
  baseUrl: string
  tags: string[]
}

export interface RouterConfig {
  enabled: boolean
  modelName: string
  baseUrl: string
}

export interface CompressionConfig {
  provider: 'anthropic' | 'openai' | 'ollama' | 'openai-compatible' | 'bedrock'
  modelName: string
  baseUrl: string
}

export interface AppSettings {
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
  navItems: NavItem[]
  models: ModelConfig[]
  defaultModelId: string
  providerKeys: { anthropic: string; openai: string; bedrock: { region: string; accessKeyId: string; secretAccessKey: string } }
  router: RouterConfig
  compression: CompressionConfig
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { viewId: 'chat',            label: 'Chat',      visible: true },
  { viewId: 'activeListening', label: 'Listen',    visible: true },
  { viewId: 'docker',          label: 'Docker',    visible: true },
  { viewId: 'git',             label: 'Git',       visible: true },
  { viewId: 'editor',          label: 'Editor',    visible: true },
  { viewId: 'heartbeat',       label: 'Heartbeat', visible: true },
  { viewId: 'settings',        label: 'Settings',  visible: true },
  { viewId: 'email',           label: 'Email',     visible: true },
]

const DEFAULT_SETTINGS: AppSettings = {
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
  navItems: DEFAULT_NAV_ITEMS,
  models: [],
  defaultModelId: '',
  providerKeys: { anthropic: '', openai: '', bedrock: { region: 'us-east-1', accessKeyId: '', secretAccessKey: '' } },
  router: { enabled: false, modelName: '', baseUrl: 'http://localhost:11434' },
  compression: { provider: 'anthropic', modelName: '', baseUrl: '' }
}

const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf-8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
}

// ── Service health checks ──

interface ServiceHealth {
  name: string
  url: string
  status: 'up' | 'down' | 'checking'
  latency?: number
}

function pingService(name: string, url: string): Promise<ServiceHealth> {
  return new Promise((resolve) => {
    const start = Date.now()
    const req = httpGet(url, (res) => {
      res.destroy()
      resolve({ name, url, status: 'up', latency: Date.now() - start })
    })
    req.setTimeout(3000, () => {
      req.destroy()
      resolve({ name, url, status: 'down' })
    })
    req.on('error', () => resolve({ name, url, status: 'down' }))
  })
}

const SERVICES = [
  { name: 'RoseLibrary', url: 'http://127.0.0.1:8000/' },
  { name: 'RoseTrainer', url: 'http://127.0.0.1:8030/' },
  { name: 'RoseSpeech',  url: 'http://127.0.0.1:8040/' }
]

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => readSettings())

  ipcMain.handle(IPC.SETTINGS_SET, async (_event, patch: Partial<AppSettings>) => {
    const current = await readSettings()
    const updated = { ...current, ...patch }
    await writeSettings(updated)
    return updated
  })

  ipcMain.handle(IPC.HEALTH_CHECK_ALL, () =>
    Promise.all(SERVICES.map((s) => pingService(s.name, s.url)))
  )
}
