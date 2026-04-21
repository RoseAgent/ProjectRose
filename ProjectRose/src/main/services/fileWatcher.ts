import { watch, type FSWatcher } from 'fs'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'

let watcher: FSWatcher | null = null

export function startWatching(dirPath: string): void {
  stopWatching()

  try {
    watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return

      const wins = BrowserWindow.getAllWindows()
      for (const win of wins) {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC.WATCHER_CHANGE, {
            event: eventType,
            path: filename
          })
        }
      }
    })
  } catch {
    // Watching may fail on some file systems; silently ignore
  }
}

export function stopWatching(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
}
