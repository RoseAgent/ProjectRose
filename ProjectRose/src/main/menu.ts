import { Menu, BrowserWindow } from 'electron'

const IPC_MENU = {
  NEW_FILE: 'menu:newFile',
  OPEN_FILE: 'menu:openFile',
  OPEN_FOLDER: 'menu:openFolder',
  SAVE: 'menu:save'
} as const

function sendToRenderer(channel: string): void {
  const win = BrowserWindow.getFocusedWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel)
  }
}

export function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToRenderer(IPC_MENU.NEW_FILE)
        },
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToRenderer(IPC_MENU.OPEN_FILE)
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendToRenderer(IPC_MENU.OPEN_FOLDER)
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToRenderer(IPC_MENU.SAVE)
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

export { IPC_MENU }
