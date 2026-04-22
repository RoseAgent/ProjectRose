import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { readSettings, writeSettings } from '../ipc/settingsHandlers'
import type { ModelConfig } from '../ipc/settingsHandlers'

const MANAGED_MODEL_ID = 'projectrose-account'
const API_BASE_URL = 'https://projectrose.ai/api/ai'

function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export async function handleDeepLink(url: string): Promise<void> {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'auth') return

    const accessToken = parsed.searchParams.get('access_token')
    const refreshToken = parsed.searchParams.get('refresh_token')
    const email = parsed.searchParams.get('email') ?? ''

    if (!accessToken || !refreshToken) return

    const settings = await readSettings()

    const managedModel: ModelConfig = {
      id: MANAGED_MODEL_ID,
      displayName: 'ProjectRose Account',
      provider: 'projectrose',
      modelName: 'managed',
      baseUrl: API_BASE_URL,
      tags: ['account']
    }

    const models = settings.models.filter((m) => m.id !== MANAGED_MODEL_ID)
    models.unshift(managedModel)

    await writeSettings({
      ...settings,
      models,
      providerKeys: {
        ...settings.providerKeys,
        projectrose: { accessToken, refreshToken, email, plan: 'free' }
      }
    })

    notifyRenderer(IPC.AUTH_CHANGED, { loggedIn: true, email })

    const [win] = BrowserWindow.getAllWindows()
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  } catch { /* ignore malformed deep links */ }
}

export async function handleLogout(): Promise<void> {
  const settings = await readSettings()
  const models = settings.models.filter((m) => m.id !== MANAGED_MODEL_ID)

  const defaultModelId = settings.defaultModelId === MANAGED_MODEL_ID
    ? (models[0]?.id ?? '')
    : settings.defaultModelId

  await writeSettings({
    ...settings,
    models,
    defaultModelId,
    providerKeys: { ...settings.providerKeys, projectrose: null }
  })

  notifyRenderer(IPC.AUTH_CHANGED, { loggedIn: false, email: '' })
}

export async function getAuthStatus(): Promise<{ loggedIn: boolean; email: string; plan: string }> {
  const settings = await readSettings()
  const pr = settings.providerKeys.projectrose
  if (!pr?.accessToken) return { loggedIn: false, email: '', plan: '' }
  return { loggedIn: true, email: pr.email, plan: pr.plan }
}
