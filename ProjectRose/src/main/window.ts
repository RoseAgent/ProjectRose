import { BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

const ICON_PATH = join(__dirname, '../../build/icon.ico')

// Theme colors matching variables.css
const THEME_COLORS = {
  dark: { bg: '#11111b', fg: '#cdd6f4' },
  light: { bg: '#dce0e8', fg: '#4c4f69' }
}

let mainWindow: BrowserWindow | null = null

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'ProjectRose',
    icon: ICON_PATH,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: THEME_COLORS.dark.bg,
      symbolColor: THEME_COLORS.dark.fg,
      height: 36
    },
    backgroundColor: THEME_COLORS.dark.bg,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    mainWindow = null
  })

  return win
}

// Update title bar overlay colors when theme changes
ipcMain.on('theme:changed', (_event, theme: 'dark' | 'light') => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const colors = THEME_COLORS[theme]
    mainWindow.setTitleBarOverlay({
      color: colors.bg,
      symbolColor: colors.fg
    })
  }
})
