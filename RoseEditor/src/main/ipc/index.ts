import { registerFileHandlers } from './fileHandlers'
import { registerDialogHandlers } from './dialogHandlers'
import { registerTerminalHandlers } from './terminalHandlers'
import { registerProjectHandlers } from './projectHandlers'
import { registerRoseLibraryHandlers } from './roseLibraryHandlers'
import { registerIndexingHandlers } from './indexingHandlers'
import { registerAiHandlers } from './aiHandlers'
import { registerDockerHandlers } from './dockerHandlers'
import { registerGitHandlers } from './gitHandlers'
import { registerRoseSetupHandlers } from './roseSetupHandlers'
import { registerHeartbeatHandlers } from './heartbeatHandlers'

export function registerAllHandlers(): void {
  registerFileHandlers()
  registerDialogHandlers()
  registerTerminalHandlers()
  registerProjectHandlers()
  registerRoseLibraryHandlers()
  registerIndexingHandlers()
  registerAiHandlers()
  registerDockerHandlers()
  registerGitHandlers()
  registerRoseSetupHandlers()
  registerHeartbeatHandlers()
}
