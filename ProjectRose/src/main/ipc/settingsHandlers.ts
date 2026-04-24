import { ipcMain, app } from 'electron'
import { join, dirname } from 'path'
import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { IPC } from '../../shared/ipcChannels'
import { NavItem } from '../../shared/types'
import { serviceStatus } from '../services/serviceStatus'
import { prPath } from '../lib/projectPaths'

export interface ModelConfig {
  id: string
  displayName: string
  provider: 'anthropic' | 'openai' | 'ollama' | 'openai-compatible' | 'bedrock' | 'projectrose'
  modelName: string
  baseUrl: string
  tags: string[]
}

export interface RouterConfig {
  enabled: boolean
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
  providerKeys: { anthropic: string; openai: string; bedrock: { region: string; accessKeyId: string; secretAccessKey: string }; projectrose: { accessToken: string; refreshToken: string; email: string; plan: string } | null }
  router: RouterConfig
  hostMode: 'projectrose' | 'self'
  includeThinkingInContext: boolean
  // Namespaced extension settings: { 'rose-discord': { global: {...}, project: {...} } }
  extensions: Record<string, Record<string, unknown>>
}

// Migrate old view IDs to extension IDs
const NAV_ID_MIGRATIONS: Record<string, string> = {
  discord: 'rose-discord',
  email: 'rose-email',
  git: 'rose-git',
  docker: 'rose-docker',
  activeListening: 'rose-listen'
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { viewId: 'chat',      label: 'Agent',     visible: true },
  { viewId: 'editor',    label: 'Editor',    visible: true },
  { viewId: 'heartbeat', label: 'Heartbeat', visible: true },
  { viewId: 'settings',  label: 'Settings',  visible: true },
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
  providerKeys: { anthropic: '', openai: '', bedrock: { region: 'us-east-1', accessKeyId: '', secretAccessKey: '' }, projectrose: null },
  router: { enabled: false, modelName: '', baseUrl: 'http://localhost:11434' },
  hostMode: 'self',
  includeThinkingInContext: false,
  extensions: {}
}

const GLOBAL_SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

interface ExtNavItem { id: string; label: string }

async function getInstalledExtensionNavItems(rootPath: string): Promise<ExtNavItem[]> {
  const extensionsDir = prPath(rootPath, 'extensions')
  try {
    const entries = await readdir(extensionsDir)
    const items: ExtNavItem[] = []
    for (const entry of entries) {
      try {
        const raw = await readFile(join(extensionsDir, entry, 'rose-extension.json'), 'utf-8')
        const manifest = JSON.parse(raw)
        if (!manifest?.id) continue
        const label: string = manifest?.navItem?.label ?? manifest?.name ?? manifest.id
        items.push({ id: manifest.id as string, label })
      } catch { /* skip invalid entries */ }
    }
    return items
  } catch {
    return []
  }
}

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
  return join(rootPath, '.projectrose', 'config.json')
}

async function mergeNavItems(stored: NavItem[], rootPath?: string): Promise<NavItem[]> {
  // Migrate legacy IDs and ensure core items are present
  const migrated = stored.map((n) => ({ ...n, viewId: NAV_ID_MIGRATIONS[n.viewId] ?? n.viewId }))
  const known = new Set(migrated.map((n) => n.viewId))
  const missingCore = DEFAULT_NAV_ITEMS.filter((n) => !known.has(n.viewId))
  const base = [...migrated, ...missingCore]

  if (!rootPath) return base

  // With a project root, reconcile rose-* items against what's actually installed
  const installedExts = await getInstalledExtensionNavItems(rootPath)
  const installedIds = new Set(installedExts.map((e) => e.id))

  const reconciled = base.filter((n) => !n.viewId.startsWith('rose-') || installedIds.has(n.viewId))
  const reconciledIds = new Set(reconciled.map((n) => n.viewId))

  const missingExts = installedExts
    .filter((e) => !reconciledIds.has(e.id))
    .map((e) => ({ viewId: e.id, label: e.label, visible: true }))

  return [...reconciled, ...missingExts]
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

  merged.navItems = await mergeNavItems(merged.navItems, rootPath)
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


export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, (_event, rootPath?: string) => readSettings(rootPath))

  ipcMain.handle(IPC.SETTINGS_SET, async (_event, patch: Partial<AppSettings>, rootPath?: string) => {
    const current = await readSettings(rootPath)
    const updated = { ...current, ...patch }
    await writeSettings(updated, rootPath)
    return updated
  })

  ipcMain.handle(IPC.HEALTH_CHECK_ALL, async () => {
    serviceStatus.roseSpeech = true
    return []
  })
}
