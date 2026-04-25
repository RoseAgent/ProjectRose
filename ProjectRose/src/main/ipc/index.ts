import { registerFileHandlers } from './fileHandlers'
import { registerDialogHandlers } from './dialogHandlers'
import { registerTerminalHandlers } from './terminalHandlers'
import { registerProjectHandlers } from './projectHandlers'
import { registerLspHandlers } from './lspHandlers'
import { registerAiHandlers } from './aiHandlers'
import { registerRoseSetupHandlers } from './roseSetupHandlers'
import { registerHeartbeatHandlers } from './heartbeatHandlers'
import { registerSettingsHandlers } from './settingsHandlers'
import { registerWhisperHandlers } from './whisperHandlers'
import { registerActiveSpeechHandlers } from './activeSpeechHandlers'
import { registerSessionHandlers } from './sessionHandlers'
import { registerProjectSettingsHandlers } from './projectSettingsHandlers'
import { registerExtensionHandlers } from './extensionHandlers'
import { registerAuthHandlers } from './authHandlers'
export function registerAllHandlers(): void {
  registerFileHandlers()
  registerDialogHandlers()
  registerTerminalHandlers()
  registerProjectHandlers()
  registerLspHandlers()
  registerAiHandlers()
  registerRoseSetupHandlers()
  registerHeartbeatHandlers()
  registerSettingsHandlers()
  registerWhisperHandlers()
  registerActiveSpeechHandlers()
  registerSessionHandlers()
  registerProjectSettingsHandlers()
  registerExtensionHandlers()
  registerAuthHandlers()
}
