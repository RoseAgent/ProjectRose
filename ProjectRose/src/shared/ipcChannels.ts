// Channels listed here are either:
//   (a) event broadcasts (main → renderer via webContents.send + renderer-side
//       `onX` subscriptions), or
//   (b) handled by hand-written handlers that earn their keep — see
//       dialog/terminal/lsp/screen handlers plus the SKILLS_UPLOAD and
//       APP_QUIT one-offs.
//
// Request/response channels for service surfaces are derived from
// `defineIpc(namespace, methods)` manifests and do NOT appear here. If you
// add a new service method, declare it in `<service>.ipc.ts` instead of
// inventing a constant here.
export const IPC = {
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_SAVE_FILE: 'dialog:saveFile',

  TERMINAL_SPAWN: 'terminal:spawn',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_DISPOSE: 'terminal:dispose',
  TERMINAL_READ_BUFFER: 'terminal:readBuffer',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',

  WATCHER_CHANGE: 'watcher:change',

  APP_QUIT: 'app:quit',

  INDEXING_PROJECT: 'indexing:project',
  INDEXING_PROGRESS: 'indexing:progress',

  // AI event broadcasts (main → renderer). Request channels — chat,
  // contextStatus, compressToolNoise, getSystemPrompt, cancel,
  // askUserResponse, captureScreenshotResult — are declared by
  // services/aiService.ipc.ts.
  AI_MODEL_SELECTED: 'ai:modelSelected',
  AI_STREAM_RESET: 'ai:streamReset',
  AI_FILE_MODIFIED: 'ai:fileModified',
  AI_TOOL_CALL_START: 'ai:toolCallStart',
  AI_TOOL_CALL_END: 'ai:toolCallEnd',
  AI_THINKING: 'ai:thinking',
  AI_TOKEN: 'ai:token',
  AI_ASK_USER: 'ai:askUser',
  AI_INJECTED_MESSAGE: 'ai:injectedMessage',
  AI_CAPTURE_SCREENSHOT: 'ai:captureScreenshot',
  // Full todo list broadcast whenever the agent calls todo_write.
  AI_TODOS_UPDATED: 'ai:todosUpdated',

  LSP_PY_TO_SERVER: 'lsp:py:toServer',
  LSP_PY_FROM_SERVER: 'lsp:py:fromServer',
  LSP_TS_TO_SERVER: 'lsp:ts:toServer',
  LSP_TS_FROM_SERVER: 'lsp:ts:fromServer',
  LSP_STARTED: 'lsp:started',
  LSP_STOPPED: 'lsp:stopped',

  // Skills (SKILLS_UPLOAD stays — dialog needs to anchor to the caller window;
  // list and delete are now declared via services/skillService.ipc.ts.)
  SKILLS_UPLOAD: 'skills:upload',

  // Account auth event broadcasts (main → renderer). Request channels are
  // declared by services/authService.ipc.ts.
  AUTH_CHANGED: 'auth:changed',
  AUTH_PAIRING_PENDING: 'auth:pairingPending',

  // Kimi OAuth event broadcasts (main → renderer). Request channels are
  // declared by services/kimiAuthService.ipc.ts.
  KIMI_AUTH_CHANGED: 'kimiAuth:changed',
  KIMI_AUTH_PENDING: 'kimiAuth:pending',

  // Amazon Bedrock credential-change broadcast (main → renderer). There's no
  // interactive sign-in flow to report progress for — SigV4 needs only a
  // stored key pair — so unlike Kimi there's no matching PENDING channel.
  // Request channels are declared by services/bedrockAuthService.ipc.ts.
  BEDROCK_AUTH_CHANGED: 'bedrockAuth:changed',

  // Doppler CLI-flow auth broadcasts (main → renderer). Request channels are
  // declared by services/dopplerImport.ipc.ts.
  DOPPLER_AUTH_CHANGED: 'dopplerAuth:changed',
  DOPPLER_AUTH_PENDING: 'dopplerAuth:pending',

  // Active Listening — only the fire-and-forget and event-broadcast channels
  // live in the enum now; the eleven invoke channels are declared by
  // services/speech/activeSpeechService.ipc.ts.
  ACTIVE_LISTENING_SEND_CHUNK: 'activeSpeech:sendChunk',
  ACTIVE_LISTENING_CANCEL_DRAFT: 'activeSpeech:cancelDraft',
  ACTIVE_LISTENING_DRAFT: 'activeSpeech:draft',
  ACTIVE_LISTENING_UTTERANCE: 'activeSpeech:utterance',

  // Screen / window capture for chat share-screen
  SCREEN_GET_SOURCES: 'screen:getSources',
  SCREEN_SET_ACTIVE_SOURCE: 'screen:setActiveSource',

  // Status bar notifications (main → renderer)
  STATUS_NOTIFY: 'status:notify',

  // Whisper model install progress (main → renderer). The whisper request
  // channels — transcribe, preloadModel, getPreloadStatus, clearPreloadStatus —
  // are declared in services/whisperService.ipc.ts.
  WHISPER_PRELOAD_PROGRESS: 'whisper:preloadProgress',

  // TTS engine + voice download progress (main → renderer). Synthesize,
  // cancel, listVoices, downloadVoice, uninstallVoice are declared by
  // services/tts/ttsService.ipc.ts.
  TTS_DOWNLOAD_PROGRESS: 'tts:downloadProgress',

  // Auto-updater event broadcasts (main → renderer). Request channels —
  // check, download, install, skipVersion — are declared by the typed manifest
  // in services/updaterService.ipc.ts.
  UPDATER_AVAILABLE: 'updater:available',
  UPDATER_NOT_AVAILABLE: 'updater:notAvailable',
  UPDATER_PROGRESS: 'updater:progress',
  UPDATER_DOWNLOADED: 'updater:downloaded',
  UPDATER_ERROR: 'updater:error',

  // Tray (main → renderer)
  TRAY_OPEN_CHAT: 'tray:openChat',
  TRAY_TOGGLE_LISTENING: 'tray:toggleListening',
  // Tray (renderer → main): renderer pushes the live `isActive` value so the
  // tray menu and icon stay in sync without main needing to introspect store.
  LISTENING_STATE_CHANGED: 'tray:listeningStateChanged',

  // Deep link (projectrose://...) delivered from main to renderer. On macOS
  // this fires from `app.on('open-url')`; Windows/Linux delivery via argv is
  // a follow-up.
  DEEPLINK_RECEIVED: 'deeplink:received'
} as const
