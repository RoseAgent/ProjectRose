import { ipcMain, app } from 'electron'
import { join, dirname } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
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
  discordBotToken: string
  discordChannels: string[]
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
  { viewId: 'discord',         label: 'Discord',   visible: true },
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
  discordBotToken: '',
  discordChannels: [],
  navItems: DEFAULT_NAV_ITEMS,
  models: [],
  defaultModelId: '',
  providerKeys: { anthropic: '', openai: '', bedrock: { region: 'us-east-1', accessKeyId: '', secretAccessKey: '' } },
  router: { enabled: false, modelName: '', baseUrl: 'http://localhost:11434' },
  compression: { provider: 'anthropic', modelName: '', baseUrl: '' }
}

const GLOBAL_SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

const SENSITIVE_FIELDS = ['providerKeys', 'imapPassword', 'discordBotToken'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(obj: any, keys: readonly string[]): any {
  const result: Record<string, unknown> = {}
  for (const k of keys) if (k in obj) result[k] = obj[k]
  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function omit(obj: any, keys: readonly string[]): any {
  const keySet = new Set(keys)
  const result: Record<string, unknown> = {}
  for (const k of Object.keys(obj)) if (!keySet.has(k)) result[k] = obj[k]
  return result
}

function getRepoConfigPath(rootPath: string): string {
  return join(rootPath, '.rose', 'config.json')
}

function mergeNavItems(stored: NavItem[]): NavItem[] {
  const known = new Set(stored.map((n) => n.viewId))
  const missing = DEFAULT_NAV_ITEMS.filter((n) => !known.has(n.viewId))
  return [...stored, ...missing]
}

export async function readSettings(rootPath?: string): Promise<AppSettings> {
  let globalSettings: Partial<AppSettings> = {}
  try { globalSettings = JSON.parse(await readFile(GLOBAL_SETTINGS_PATH, 'utf-8')) } catch { /* defaults */ }

  // Non-sensitive fields from old userData file serve as migration fallback
  const nonSensitiveFallback: Partial<AppSettings> = omit(globalSettings, SENSITIVE_FIELDS)

  let repoConfig: Partial<AppSettings> = {}
  if (rootPath) {
    try { repoConfig = JSON.parse(await readFile(getRepoConfigPath(rootPath), 'utf-8')) } catch { /* not created yet */ }
  }

  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...nonSensitiveFallback,
    ...repoConfig,
    ...pick(globalSettings, SENSITIVE_FIELDS)
  }

  merged.navItems = mergeNavItems(merged.navItems)
  return merged
}

export async function writeSettings(settings: AppSettings, rootPath?: string): Promise<void> {
  let existing: Partial<AppSettings> = {}
  try { existing = JSON.parse(await readFile(GLOBAL_SETTINGS_PATH, 'utf-8')) } catch { /* ok */ }
  await writeFile(GLOBAL_SETTINGS_PATH, JSON.stringify({ ...existing, ...pick(settings, SENSITIVE_FIELDS) }, null, 2), 'utf-8')

  if (rootPath) {
    const repoData = omit(settings, SENSITIVE_FIELDS)
    await mkdir(dirname(getRepoConfigPath(rootPath)), { recursive: true })
    await writeFile(getRepoConfigPath(rootPath), JSON.stringify(repoData, null, 2), 'utf-8')
  }
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
  ipcMain.handle(IPC.SETTINGS_GET, (_event, rootPath?: string) => readSettings(rootPath))

  ipcMain.handle(IPC.SETTINGS_SET, async (_event, patch: Partial<AppSettings>, rootPath?: string) => {
    const current = await readSettings(rootPath)
    const updated = { ...current, ...patch }
    await writeSettings(updated, rootPath)
    return updated
  })

  ipcMain.handle(IPC.HEALTH_CHECK_ALL, () =>
    Promise.all(SERVICES.map((s) => pingService(s.name, s.url)))
  )
}
