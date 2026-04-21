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
import { registerSettingsHandlers } from './settingsHandlers'
import { registerWhisperHandlers } from './whisperHandlers'
import { registerActiveSpeechHandlers } from './activeSpeechHandlers'
import { registerEmailHandlers } from './emailHandlers'
import { registerSessionHandlers } from './sessionHandlers'
import { registerProjectSettingsHandlers } from './projectSettingsHandlers'
import { registerDiscordHandlers } from './discordHandlers'
import { registerExtensionHandlers } from './extensionHandlers'

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
  registerSettingsHandlers()
  registerWhisperHandlers()
  registerActiveSpeechHandlers()
  registerEmailHandlers()
  registerSessionHandlers()
  registerProjectSettingsHandlers()
  registerDiscordHandlers()
  registerExtensionHandlers()
}
