import { ipcMain, app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { get as httpGet } from 'http'
import { IPC } from '../../shared/ipcChannels'

export interface AppSettings {
  heartbeatEnabled: boolean
  heartbeatIntervalMinutes: number
  micDeviceId: string
  userName: string
  agentName: string
  roseSpeechSpeakerId: number | null
  activeListeningSetupComplete: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  heartbeatEnabled: true,
  heartbeatIntervalMinutes: 5,
  micDeviceId: '',
  userName: '',
  agentName: '',
  roseSpeechSpeakerId: null,
  activeListeningSetupComplete: false
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
  { name: 'RoseModel',   url: 'http://127.0.0.1:8010/' },
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
