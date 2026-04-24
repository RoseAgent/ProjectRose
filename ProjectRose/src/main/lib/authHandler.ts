import { BrowserWindow, session } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { readSettings, writeSettings } from '../ipc/settingsHandlers'

const LOCAL_BASE_URL = 'http://localhost:8000'
const SESSION_COOKIE = 'projectrose_session'
const REFRESH_COOKIE = 'projectrose_refresh'

function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

export async function openAuthWindow(): Promise<void> {
  const [parent] = BrowserWindow.getAllWindows()

  const authWin = new BrowserWindow({
    width: 480,
    height: 680,
    parent,
    modal: true,
    autoHideMenuBar: true,
    title: 'Sign In — ProjectRose',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  authWin.loadURL(`${LOCAL_BASE_URL}/auth`)

  authWin.webContents.on('did-navigate', async (_event, url) => {
    if (!url.includes('/dashboard')) return

    try {
      const [sessionCookie] = await session.defaultSession.cookies.get({ url: LOCAL_BASE_URL, name: SESSION_COOKIE })
      const [refreshCookie] = await session.defaultSession.cookies.get({ url: LOCAL_BASE_URL, name: REFRESH_COOKIE })

      const accessToken = sessionCookie?.value
      const refreshToken = refreshCookie?.value ?? ''
      if (!accessToken) return

      const res = await fetch(`${LOCAL_BASE_URL}/api/me`, {
        headers: { Cookie: `${SESSION_COOKIE}=${accessToken}` },
      })
      if (!res.ok) return

      const data = await res.json() as { user: Record<string, string> }
      const email = data.user.email ?? ''
      const plan = data.user.plan_key ?? 'free'

      const settings = await readSettings()
      await writeSettings({
        ...settings,
        providerKeys: {
          ...settings.providerKeys,
          projectrose: { accessToken, refreshToken, email, plan },
        },
      })

      notifyRenderer(IPC.AUTH_CHANGED, { loggedIn: true, email })

      if (parent && !parent.isDestroyed()) { if (parent.isMinimized()) parent.restore(); parent.focus() }
    } catch { /* ignore network/parse errors */ } finally {
      if (!authWin.isDestroyed()) authWin.close()
    }
  })
}

export async function handleLogout(): Promise<void> {
  const settings = await readSettings()

  try {
    const token = settings.providerKeys.projectrose?.accessToken
    if (token) {
      await fetch(`${LOCAL_BASE_URL}/auth/signout`, {
        headers: { Cookie: `${SESSION_COOKIE}=${token}` },
      }).catch(() => {})
    }
    await session.defaultSession.cookies.remove(LOCAL_BASE_URL, SESSION_COOKIE)
    await session.defaultSession.cookies.remove(LOCAL_BASE_URL, REFRESH_COOKIE)
  } catch { /* best effort */ }

  await writeSettings({
    ...settings,
    providerKeys: { ...settings.providerKeys, projectrose: null },
  })

  notifyRenderer(IPC.AUTH_CHANGED, { loggedIn: false, email: '' })
}

export async function getAuthStatus(): Promise<{ loggedIn: boolean; email: string; plan: string }> {
  const settings = await readSettings()
  const pr = settings.providerKeys.projectrose
  if (!pr?.accessToken) return { loggedIn: false, email: '', plan: '' }
  return { loggedIn: true, email: pr.email, plan: pr.plan }
}
