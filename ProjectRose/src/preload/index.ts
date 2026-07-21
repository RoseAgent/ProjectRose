import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipcChannels'
import type { FileNode, RecentProject, ToolMeta } from '../shared/types'
import type { Message } from '../shared/roseModelTypes'
import { sessionIpc, externalIpc, workspacesIpc } from '../main/services/conversation.ipc'
import { promptIpc } from '../main/services/promptService.ipc'
import { skillIpc } from '../main/services/skillService.ipc'
import { interactionLogIpc } from '../main/services/interactionLog.ipc'
import { fileIpc } from '../main/services/fileService.ipc'
import { recentProjectsIpc } from '../main/services/recentProjects.ipc'
import { settingsIpc, healthIpc, searchIpc } from '../main/services/settingsService.ipc'
import { dopplerIpc } from '../main/services/dopplerImport.ipc'
import type { TodoItem } from '../shared/todos'
import type { ModelConfig } from '../shared/modelConfig'
import { projectSettingsIpc, toolsIpc } from '../main/services/projectSettingsService.ipc'
import { roseSetupIpc } from '../main/services/roseSetupService.ipc'
import { whisperIpc } from '../main/services/whisperService.ipc'
import { updaterIpc } from '../main/services/updaterService.ipc'
import { authIpc } from '../main/services/authService.ipc'
import { kimiAuthIpc } from '../main/services/kimiAuthService.ipc'
import { bedrockAuthIpc } from '../main/services/bedrockAuthService.ipc'
import { aiIpc } from '../main/services/aiService.ipc'
import { activeSpeechIpc } from '../main/services/speech/activeSpeechService.ipc'
import { extensionIpc } from '../main/services/extensionService.ipc'
import { routinesIpc } from '../main/extensions/builtins/rose-routines/routinesService.ipc'
import { channelsIpc } from '../main/extensions/builtins/rose-channels/channelsService.ipc'
import { contactsIpc } from '../main/services/contacts/contactsService.ipc'
import { eventsIpc } from '../main/services/calendar/eventsService.ipc'
import { emailIpc } from '../main/services/email/emailService.ipc'
import { ttsIpc } from '../main/services/tts/ttsService.ipc'

const api = {
  // Host OS platform — the renderer needs it to quote terminal commands
  // correctly (PowerShell vs POSIX shells).
  platform: process.platform as string,

  // Theme
  setNativeTheme: (theme: 'dark' | 'light' | 'herbarium'): void => {
    ipcRenderer.send('theme:changed', theme)
  },

  // Menu events
  onMenuNewFile: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:newFile', handler)
    return () => { ipcRenderer.removeListener('menu:newFile', handler) }
  },
  onMenuOpenFile: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:openFile', handler)
    return () => { ipcRenderer.removeListener('menu:openFile', handler) }
  },
  onMenuOpenFolder: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:openFolder', handler)
    return () => { ipcRenderer.removeListener('menu:openFolder', handler) }
  },
  onMenuSave: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on('menu:save', handler)
    return () => { ipcRenderer.removeListener('menu:save', handler) }
  },

  // File operations — kept flat on api.* to avoid a renderer-side churn slice;
  // a follow-up can namespace them under api.file.
  readFile: fileIpc.bindings.read,
  writeFile: (filePath: string, content: string): Promise<void> =>
    fileIpc.bindings.write({ filePath, content }),
  createFile: fileIpc.bindings.create,
  deleteFile: fileIpc.bindings.delete,
  deleteDirectory: fileIpc.bindings.deleteDir,
  renameFile: (oldPath: string, newPath: string): Promise<void> =>
    fileIpc.bindings.rename({ oldPath, newPath }),
  createDirectory: fileIpc.bindings.createDir,
  readDirectoryTree: fileIpc.bindings.readDirTree,

  openFolderDialog: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.DIALOG_OPEN_FOLDER),

  openFileDialog: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE),

  saveFileDialog: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.DIALOG_SAVE_FILE, defaultPath),

  spawnTerminal: (config?: { cwd?: string }): Promise<string> =>
    ipcRenderer.invoke(IPC.TERMINAL_SPAWN, config),

  writeTerminal: (sessionId: string, data: string): void => {
    ipcRenderer.send(IPC.TERMINAL_WRITE, { sessionId, data })
  },

  resizeTerminal: (sessionId: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke(IPC.TERMINAL_RESIZE, { sessionId, cols, rows }),

  disposeTerminal: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.TERMINAL_DISPOSE, sessionId),

  readTerminalBuffer: (sessionId: string): Promise<string> =>
    ipcRenderer.invoke(IPC.TERMINAL_READ_BUFFER, sessionId),

  onTerminalData: (callback: (data: string) => void): (() => void) => {
    const handler = (_event: unknown, data: string): void => callback(data)
    ipcRenderer.on(IPC.TERMINAL_DATA, handler)
    return () => {
      ipcRenderer.removeListener(IPC.TERMINAL_DATA, handler)
    }
  },

  onTerminalExit: (callback: (code: number) => void): (() => void) => {
    const handler = (_event: unknown, code: number): void => callback(code)
    ipcRenderer.on(IPC.TERMINAL_EXIT, handler)
    return () => {
      ipcRenderer.removeListener(IPC.TERMINAL_EXIT, handler)
    }
  },

  onFileChange: (callback: (event: string, path: string) => void): (() => void) => {
    const handler = (_event: unknown, data: { event: string; path: string }): void =>
      callback(data.event, data.path)
    ipcRenderer.on(IPC.WATCHER_CHANGE, handler)
    return () => {
      ipcRenderer.removeListener(IPC.WATCHER_CHANGE, handler)
    }
  },

  getRecentProjects: recentProjectsIpc.bindings.getRecent,

  checkRoseMd: roseSetupIpc.bindings.checkMd,
  ensureScaffold: roseSetupIpc.bindings.ensureScaffold,
  initProject: roseSetupIpc.bindings.initProject,

  getSettings: settingsIpc.bindings.get,
  setSettings: settingsIpc.bindings.set,
  checkServicesHealth: healthIpc.bindings.checkAll,

  // BYO web-search provider (Settings > Providers > Search)
  searchProvider: searchIpc.bindings,

  // Doppler secrets import (Settings > Connected Accounts) — manifest
  // bindings plus the hand-written device-flow event subscriptions.
  doppler: {
    ...dopplerIpc.bindings,
    onChanged: (callback: (data: { loggedIn: boolean }) => void): (() => void) => {
      const handler = (_e: unknown, data: { loggedIn: boolean }): void => callback(data)
      ipcRenderer.on(IPC.DOPPLER_AUTH_CHANGED, handler)
      return () => { ipcRenderer.removeListener(IPC.DOPPLER_AUTH_CHANGED, handler) }
    },
    onPending: (callback: (data: { url: string; userCode: string }) => void): (() => void) => {
      const handler = (_e: unknown, data: { url: string; userCode: string }): void => callback(data)
      ipcRenderer.on(IPC.DOPPLER_AUTH_PENDING, handler)
      return () => { ipcRenderer.removeListener(IPC.DOPPLER_AUTH_PENDING, handler) }
    }
  },

  transcribeAudio: whisperIpc.bindings.transcribe,

  whisper: {
    preloadModel: whisperIpc.bindings.preloadModel,
    getPreloadStatus: whisperIpc.bindings.getPreloadStatus,
    clearPreloadStatus: whisperIpc.bindings.clearPreloadStatus,
    onPreloadProgress: (
      callback: (payload: {
        modelId: string | null
        status: 'idle' | 'preparing' | 'downloading' | 'ready' | 'error'
        percent: number
        loaded: number
        total: number
        fileLabel: string
        error: string
      }) => void
    ): (() => void) => {
      const handler = (_e: unknown, payload: {
        modelId: string | null
        status: 'idle' | 'preparing' | 'downloading' | 'ready' | 'error'
        percent: number
        loaded: number
        total: number
        fileLabel: string
        error: string
      }): void => callback(payload)
      ipcRenderer.on(IPC.WHISPER_PRELOAD_PROGRESS, handler)
      return () => { ipcRenderer.removeListener(IPC.WHISPER_PRELOAD_PROGRESS, handler) }
    }
  },

  // Active Listening / RoseSpeech — invoke methods come from the manifest;
  // sendChunk / cancelDraft are fire-and-forget (ipcRenderer.send) and the
  // onUtterance / onDraft subscriptions are event broadcasts. Both stay
  // hand-written.
  activeSpeech: {
    ...activeSpeechIpc.bindings,
    sendChunk: (payload: { sessionId: number; audioBuffer: ArrayBuffer }): void =>
      ipcRenderer.send(IPC.ACTIVE_LISTENING_SEND_CHUNK, payload),
    cancelDraft: (payload: { sessionId: number }): void =>
      ipcRenderer.send(IPC.ACTIVE_LISTENING_CANCEL_DRAFT, payload),
    onUtterance: (callback: (evt: { sessionId: number; utterance_id: number; speaker_name: string | null; text: string }) => void): (() => void) => {
      const handler = (_e: unknown, evt: { sessionId: number; utterance_id: number; speaker_name: string | null; text: string }): void => callback(evt)
      ipcRenderer.on(IPC.ACTIVE_LISTENING_UTTERANCE, handler)
      return () => { ipcRenderer.removeListener(IPC.ACTIVE_LISTENING_UTTERANCE, handler) }
    },
    onDraft: (callback: (evt: { sessionId: number; status: 'building' | 'submitted' | 'cancelled'; text: string; secondsLeft: number | null }) => void): (() => void) => {
      const handler = (_e: unknown, evt: { sessionId: number; status: 'building' | 'submitted' | 'cancelled'; text: string; secondsLeft: number | null }): void => callback(evt)
      ipcRenderer.on(IPC.ACTIVE_LISTENING_DRAFT, handler)
      return () => { ipcRenderer.removeListener(IPC.ACTIVE_LISTENING_DRAFT, handler) }
    }
  },

  addRecentProject: recentProjectsIpc.bindings.addRecent,
  removeRecentProject: recentProjectsIpc.bindings.removeRecent,

  quitApp: (): Promise<void> =>
    ipcRenderer.invoke(IPC.APP_QUIT),

  // AI — request methods wrap the manifest payload-style bindings into the
  // existing positional renderer API. Event subscriptions stay hand-written
  // below (broadcasts aren't manifest-covered).
  aiChat: (messages: Message[], rootPath: string, sessionId: string, model?: ModelConfig) =>
    aiIpc.bindings.chat({ messages, rootPath, sessionId, model }),
  aiContextStatus: (
    rootPath: string,
    messages: Array<Record<string, unknown>>,
    compression: {
      compressedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
      compressedFromCount: number
      compressedFromRawCount: number
    } | null,
    model?: ModelConfig
  ) => aiIpc.bindings.contextStatus({ rootPath, messages, compression, model }),
  aiCompressToolNoise: (
    rootPath: string,
    messages: Array<Record<string, unknown>>,
    full?: boolean,
    model?: ModelConfig
  ) => aiIpc.bindings.compressToolNoise({ rootPath, messages, full, model }),
  aiGetSystemPrompt: aiIpc.bindings.getSystemPrompt,

  onAiFileModified: (callback: (data: { path: string }) => void): (() => void) => {
    const handler = (_event: unknown, data: { path: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_FILE_MODIFIED, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_FILE_MODIFIED, handler) }
  },

  onAiToolCallStart: (callback: (data: { sessionId: string; id: string; name: string; params: Record<string, unknown> }) => void): (() => void) => {
    const handler = (_e: unknown, data: { sessionId: string; id: string; name: string; params: Record<string, unknown> }): void => callback(data)
    ipcRenderer.on(IPC.AI_TOOL_CALL_START, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_TOOL_CALL_START, handler) }
  },

  onAiToolCallEnd: (callback: (data: { sessionId: string; id: string; result: string; error: boolean }) => void): (() => void) => {
    const handler = (_e: unknown, data: { sessionId: string; id: string; result: string; error: boolean }): void => callback(data)
    ipcRenderer.on(IPC.AI_TOOL_CALL_END, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_TOOL_CALL_END, handler) }
  },

  onAiThinking: (callback: (data: { sessionId: string; content: string }) => void): (() => void) => {
    const handler = (_e: unknown, data: { sessionId: string; content: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_THINKING, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_THINKING, handler) }
  },

  onAiToken: (callback: (data: { sessionId: string; token: string }) => void): (() => void) => {
    const handler = (_e: unknown, data: { sessionId: string; token: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_TOKEN, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_TOKEN, handler) }
  },

  onAiModelSelected: (callback: (data: { sessionId: string; modelDisplay: string }) => void): (() => void) => {
    const handler = (_e: unknown, data: { sessionId: string; modelDisplay: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_MODEL_SELECTED, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_MODEL_SELECTED, handler) }
  },

  onAiStreamReset: (callback: (data: { sessionId: string; errorMessage: string; fallbackModel: string }) => void): (() => void) => {
    const handler = (_e: unknown, data: { sessionId: string; errorMessage: string; fallbackModel: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_STREAM_RESET, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_STREAM_RESET, handler) }
  },

  aiCancelGeneration: (sessionId: string): Promise<void> =>
    aiIpc.bindings.cancel({ sessionId }),

  onAiAskUser: (callback: (data: { sessionId: string; questionId: string; question: string; options: string[] }) => void): (() => void) => {
    const handler = (_e: unknown, data: { sessionId: string; questionId: string; question: string; options: string[] }): void => callback(data)
    ipcRenderer.on(IPC.AI_ASK_USER, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_ASK_USER, handler) }
  },

  aiAskUserResponse: (sessionId: string, questionId: string, answer: string) =>
    aiIpc.bindings.askUserResponse({ sessionId, questionId, answer }),

  onAiInjectedMessage: (callback: (data: { sessionId: string; extensionId: string; extensionName: string; extensionIcon?: string; content: string }) => void): (() => void) => {
    const handler = (_e: unknown, data: { sessionId: string; extensionId: string; extensionName: string; extensionIcon?: string; content: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_INJECTED_MESSAGE, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_INJECTED_MESSAGE, handler) }
  },

  onAiTodosUpdated: (callback: (data: { sessionId: string; todos: TodoItem[] }) => void): (() => void) => {
    const handler = (_e: unknown, data: { sessionId: string; todos: TodoItem[] }): void => callback(data)
    ipcRenderer.on(IPC.AI_TODOS_UPDATED, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_TODOS_UPDATED, handler) }
  },

  onAiCaptureScreenshot: (
    callback: (data: { requestId: string; sessionId: string }) => void
  ): (() => void) => {
    const handler = (_e: unknown, data: { requestId: string; sessionId: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_CAPTURE_SCREENSHOT, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_CAPTURE_SCREENSHOT, handler) }
  },

  aiCaptureScreenshotResult: (
    sessionId: string,
    requestId: string,
    result:
      | { ok: true; dataUrl: string; mode: 'screen' | 'webcam'; sourceLabel: string | null }
      | { ok: false; reason: string }
  ) => aiIpc.bindings.captureScreenshotResult({ sessionId, requestId, result }),

  // Indexing / LSP startup
  indexProject: (rootPath: string): Promise<{ indexed: number; total: number; error?: string }> =>
    ipcRenderer.invoke(IPC.INDEXING_PROJECT, rootPath),

  onIndexingProgress: (callback: (progress: { phase: string; total: number; completed: number; message: string }) => void): (() => void) => {
    const handler = (_event: unknown, progress: { phase: string; total: number; completed: number; message: string }): void =>
      callback(progress)
    ipcRenderer.on(IPC.INDEXING_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IPC.INDEXING_PROGRESS, handler)
    }
  },

  onTrayOpenChat: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC.TRAY_OPEN_CHAT, handler)
    return () => { ipcRenderer.removeListener(IPC.TRAY_OPEN_CHAT, handler) }
  },

  onTrayToggleListening: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC.TRAY_TOGGLE_LISTENING, handler)
    return () => { ipcRenderer.removeListener(IPC.TRAY_TOGGLE_LISTENING, handler) }
  },

  notifyListeningStateChanged: (active: boolean): void => {
    ipcRenderer.send(IPC.LISTENING_STATE_CHANGED, { active })
  },

  onStatusNotify: (callback: (payload: { text: string; tone?: 'info' | 'success' | 'error' | 'warning'; durationMs?: number }) => void): (() => void) => {
    const handler = (_event: unknown, payload: { text: string; tone?: 'info' | 'success' | 'error' | 'warning'; durationMs?: number }): void =>
      callback(payload)
    ipcRenderer.on(IPC.STATUS_NOTIFY, handler)
    return () => {
      ipcRenderer.removeListener(IPC.STATUS_NOTIFY, handler)
    }
  },

  // LSP bridge
  lsp: {
    sendToServer: (server: 'py' | 'ts', msg: object): void => {
      ipcRenderer.send(server === 'py' ? IPC.LSP_PY_TO_SERVER : IPC.LSP_TS_TO_SERVER, msg)
    },
    onMessage: (server: 'py' | 'ts', callback: (msg: unknown) => void): (() => void) => {
      const channel = server === 'py' ? IPC.LSP_PY_FROM_SERVER : IPC.LSP_TS_FROM_SERVER
      const handler = (_event: unknown, msg: unknown): void => callback(msg)
      ipcRenderer.on(channel, handler)
      return () => { ipcRenderer.removeListener(channel, handler) }
    },
    onStarted: (callback: (status: { py: boolean; ts: boolean }) => void): (() => void) => {
      const handler = (_event: unknown, status: { py: boolean; ts: boolean }): void => callback(status)
      ipcRenderer.on(IPC.LSP_STARTED, handler)
      return () => { ipcRenderer.removeListener(IPC.LSP_STARTED, handler) }
    },
    onStopped: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on(IPC.LSP_STOPPED, handler)
      return () => { ipcRenderer.removeListener(IPC.LSP_STOPPED, handler) }
    }
  },

  // Chat Sessions (Conversations), read-only External Sessions, and the
  // known-workspace registry for the New Conversation picker.
  session: sessionIpc.bindings,
  external: externalIpc.bindings,
  workspaces: workspacesIpc.bindings,

  // Tools + Project settings — the hard-coded channel strings ('tools:list',
  // 'project:getSettings', 'project:setSettings') that used to live here are
  // gone; the manifest derives them from namespace + method.
  tools: toolsIpc.bindings,
  project: projectSettingsIpc.bindings,

  prompts: promptIpc.bindings,

  // Extensions
  extension: extensionIpc.bindings,

  // Routines (built-in rose-routines extension's IPC surface). Bound flat on
  // api.routines.* mirroring api.contacts / api.email.
  routines: routinesIpc.bindings,

  // Channels (built-in rose-channels extension's IPC surface). Bound flat
  // on api.channels.* mirroring api.routines.
  channels: channelsIpc.bindings,

  // Contacts (~/.rose/contact/) and Events (~/.rose/calendar/) — bound flat
  // on api.contacts.* / api.events.* so renderer call sites mirror
  // window.api.skills, window.api.session, etc.
  contacts: contactsIpc.bindings,
  events: eventsIpc.bindings,

  // Email — bound flat on api.email.* for the rose-email built-in's
  // InboxPage and EmailSettings views.
  email: emailIpc.bindings,

  // TTS — manifest bindings (synthesize, cancel, listVoices, downloadVoice,
  // uninstallVoice, getReadiness) plus the hand-written progress broadcast
  // subscription that powers the install pill in Settings.
  tts: {
    ...ttsIpc.bindings,
    onDownloadProgress: (
      callback: (payload: {
        voiceId: string
        stage: string
        percent: number
        bytesLoaded: number
        bytesTotal: number
        status: 'preparing' | 'downloading' | 'ready' | 'error'
        error?: string
      }) => void
    ): (() => void) => {
      const handler = (_e: unknown, payload: {
        voiceId: string
        stage: string
        percent: number
        bytesLoaded: number
        bytesTotal: number
        status: 'preparing' | 'downloading' | 'ready' | 'error'
        error?: string
      }): void => callback(payload)
      ipcRenderer.on(IPC.TTS_DOWNLOAD_PROGRESS, handler)
      return () => { ipcRenderer.removeListener(IPC.TTS_DOWNLOAD_PROGRESS, handler) }
    }
  },

  // Account auth — request methods from the manifest; event subscriptions
  // (onChanged, onPairingPending) stay hand-written.
  auth: {
    login: authIpc.bindings.login,
    logout: authIpc.bindings.logout,
    cancel: authIpc.bindings.cancel,
    getStatus: authIpc.bindings.getStatus,
    getUsage: authIpc.bindings.getUsage,
    onChanged: (callback: (data: { loggedIn: boolean; email: string; name: string; avatar: string }) => void): (() => void) => {
      const handler = (_e: unknown, data: { loggedIn: boolean; email: string; name: string; avatar: string }): void => callback(data)
      ipcRenderer.on(IPC.AUTH_CHANGED, handler)
      return () => { ipcRenderer.removeListener(IPC.AUTH_CHANGED, handler) }
    },
    onPairingPending: (callback: (data: { url: string }) => void): (() => void) => {
      const handler = (_e: unknown, data: { url: string }): void => callback(data)
      ipcRenderer.on(IPC.AUTH_PAIRING_PENDING, handler)
      return () => { ipcRenderer.removeListener(IPC.AUTH_PAIRING_PENDING, handler) }
    }
  },

  // Kimi OAuth (device flow) — request methods from the manifest; event
  // subscriptions (onChanged, onPending) stay hand-written.
  kimiAuth: {
    login: kimiAuthIpc.bindings.login,
    logout: kimiAuthIpc.bindings.logout,
    cancel: kimiAuthIpc.bindings.cancel,
    getStatus: kimiAuthIpc.bindings.getStatus,
    saveApiKey: kimiAuthIpc.bindings.saveApiKey,
    clearApiKey: kimiAuthIpc.bindings.clearApiKey,
    listModels: kimiAuthIpc.bindings.listModels,
    onChanged: (callback: (data: { loggedIn: boolean; apiKeyStored: boolean }) => void): (() => void) => {
      const handler = (_e: unknown, data: { loggedIn: boolean; apiKeyStored: boolean }): void => callback(data)
      ipcRenderer.on(IPC.KIMI_AUTH_CHANGED, handler)
      return () => { ipcRenderer.removeListener(IPC.KIMI_AUTH_CHANGED, handler) }
    },
    onPending: (callback: (data: { url: string; userCode: string }) => void): (() => void) => {
      const handler = (_e: unknown, data: { url: string; userCode: string }): void => callback(data)
      ipcRenderer.on(IPC.KIMI_AUTH_PENDING, handler)
      return () => { ipcRenderer.removeListener(IPC.KIMI_AUTH_PENDING, handler) }
    }
  },

  // Amazon Bedrock — request methods from the manifest; the change
  // subscription stays hand-written. No onPending counterpart: SigV4 needs
  // only a stored key pair, so there's no interactive flow to report on.
  bedrockAuth: {
    getStatus: bedrockAuthIpc.bindings.getStatus,
    saveCredentials: bedrockAuthIpc.bindings.saveCredentials,
    clearCredentials: bedrockAuthIpc.bindings.clearCredentials,
    listModels: bedrockAuthIpc.bindings.listModels,
    onChanged: (callback: (data: { credentialsStored: boolean; region: string }) => void): (() => void) => {
      const handler = (_e: unknown, data: { credentialsStored: boolean; region: string }): void => callback(data)
      ipcRenderer.on(IPC.BEDROCK_AUTH_CHANGED, handler)
      return () => { ipcRenderer.removeListener(IPC.BEDROCK_AUTH_CHANGED, handler) }
    }
  },

  // Auto-updater — request methods come from the manifest; the on* event
  // subscriptions stay hand-written because broadcasts aren't manifest-covered.
  updater: {
    checkForUpdates: updaterIpc.bindings.check,
    downloadUpdate: updaterIpc.bindings.download,
    installUpdate: updaterIpc.bindings.install,
    skipVersion: updaterIpc.bindings.skipVersion,
    onAvailable: (callback: (info: { version: string; releaseNotes: string | null }) => void): (() => void) => {
      const handler = (_e: unknown, info: { version: string; releaseNotes: string | null }): void => callback(info)
      ipcRenderer.on(IPC.UPDATER_AVAILABLE, handler)
      return () => { ipcRenderer.removeListener(IPC.UPDATER_AVAILABLE, handler) }
    },
    onNotAvailable: (callback: (info: { version: string }) => void): (() => void) => {
      const handler = (_e: unknown, info: { version: string }): void => callback(info)
      ipcRenderer.on(IPC.UPDATER_NOT_AVAILABLE, handler)
      return () => { ipcRenderer.removeListener(IPC.UPDATER_NOT_AVAILABLE, handler) }
    },
    onProgress: (callback: (info: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void): (() => void) => {
      const handler = (_e: unknown, info: { percent: number; bytesPerSecond: number; transferred: number; total: number }): void => callback(info)
      ipcRenderer.on(IPC.UPDATER_PROGRESS, handler)
      return () => { ipcRenderer.removeListener(IPC.UPDATER_PROGRESS, handler) }
    },
    onDownloaded: (callback: (info: { version: string; releaseNotes: string | null }) => void): (() => void) => {
      const handler = (_e: unknown, info: { version: string; releaseNotes: string | null }): void => callback(info)
      ipcRenderer.on(IPC.UPDATER_DOWNLOADED, handler)
      return () => { ipcRenderer.removeListener(IPC.UPDATER_DOWNLOADED, handler) }
    },
    onError: (callback: (info: { message: string }) => void): (() => void) => {
      const handler = (_e: unknown, info: { message: string }): void => callback(info)
      ipcRenderer.on(IPC.UPDATER_ERROR, handler)
      return () => { ipcRenderer.removeListener(IPC.UPDATER_ERROR, handler) }
    }
  },

  // Screen / window capture (chat share-screen)
  screen: {
    getSources: (): Promise<{ id: string; name: string; displayId: string; thumbnailDataURL: string; appIconDataURL: string | null }[]> =>
      ipcRenderer.invoke(IPC.SCREEN_GET_SOURCES),
    setActiveSource: (sourceId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.SCREEN_SET_ACTIVE_SOURCE, sourceId)
  },

  // Skills — manifest bindings (list, delete) plus the hand-written upload
  // handler that has to stay in main because it opens a file dialog anchored
  // to the calling window. The merge pattern (spread bindings, then add
  // hand-written entries) is the template later mixed-namespace slices copy.
  skills: {
    ...skillIpc.bindings,
    upload: (rootPath: string): Promise<{ ok: boolean; canceled?: boolean; skills?: { name: string; description: string }[] }> =>
      ipcRenderer.invoke(IPC.SKILLS_UPLOAD, rootPath)
  },

  // In-memory user-interaction log — renderer chokepoints fire-and-forget here
  // so the agent can read the most recent UI actions via read_recent_interactions.
  interactions: interactionLogIpc.bindings,

  // Generic IPC bridge — used by dynamically-loaded extensions
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const handler = (_event: unknown, ...args: unknown[]): void => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => { ipcRenderer.removeListener(channel, handler) }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
