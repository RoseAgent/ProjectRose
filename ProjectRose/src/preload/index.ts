import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipcChannels'

const api = {
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

  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.FILE_READ, filePath),

  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FILE_WRITE, { filePath, content }),

  createFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FILE_CREATE, filePath),

  deleteFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FILE_DELETE, filePath),

  deleteDirectory: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FILE_DELETE_DIR, dirPath),

  renameFile: (oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FILE_RENAME, { oldPath, newPath }),

  createDirectory: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FILE_CREATE_DIR, dirPath),

  readDirectoryTree: (dirPath: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC.FILE_READ_DIR_TREE, dirPath),

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

  getRecentProjects: (): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC.PROJECTS_GET_RECENT),

  getDefaultProjectPath: (): Promise<string> =>
    ipcRenderer.invoke(IPC.PROJECTS_GET_DEFAULT_PATH),

  checkRoseMd: (rootPath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.ROSE_CHECK_MD, rootPath),

  ensureScaffold: (rootPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.ROSE_ENSURE_SCAFFOLD, rootPath),

  initProject: (payload: { rootPath: string; name: string; identity: string; autonomy: string; userName: string; commStyle: string; depth: string; proactivity: string }): Promise<void> =>
    ipcRenderer.invoke(IPC.ROSE_INIT_PROJECT, payload),

  getSettings: (rootPath?: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC.SETTINGS_GET, rootPath),

  setSettings: (patch: Record<string, unknown>, rootPath?: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, patch, rootPath),

  checkServicesHealth: (): Promise<Array<{ name: string; url: string; status: 'up' | 'down'; latency?: number }>> =>
    ipcRenderer.invoke(IPC.HEALTH_CHECK_ALL),

  transcribeAudio: (audioBuffer: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke(IPC.WHISPER_TRANSCRIBE, audioBuffer),

  // Active Listening / RoseSpeech
  activeSpeech: {
    getSpeakers: (projectPath: string): Promise<Array<{ id: number; name: string; created_at: string }>> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_GET_SPEAKERS, projectPath),
    createSpeaker: (payload: { name: string; projectPath: string }): Promise<{ id: number; name: string }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_CREATE_SPEAKER, payload),
    addSample: (payload: { speakerId: number; source: string; audioBuffer: ArrayBuffer; projectId?: string; projectPath: string }): Promise<{ id: number }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_ADD_SAMPLE, payload),
    labelSpeaker: (payload: { utteranceId: number; speakerId?: number; speakerName?: string; projectPath: string }): Promise<{ ok: boolean; speaker_id: number }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_LABEL_SPEAKER, payload),
    train: (projectPath: string): Promise<{ job_id: number }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_TRAIN, projectPath),
    trainStatus: (payload: { jobId: number; projectPath: string }): Promise<{ status: string; accuracy: number | null; deployed: boolean; error: string | null }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_TRAIN_STATUS, payload),
    trainHistory: (projectPath: string): Promise<Array<{ id: number; accuracy: number; is_active: boolean; trained_at: string; sample_count: number; notes: string | null }>> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_TRAIN_HISTORY, projectPath),
    createSession: (payload: { projectPath: string; projectId?: string }): Promise<{ id: number }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_CREATE_SESSION, payload),
    endSession: (payload: { sessionId: number; projectPath: string }): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_END_SESSION, payload),
    getUtterances: (payload: { sessionId: number; projectPath: string }): Promise<Array<{ id: number; text: string; speaker_name: string | null; speaker_id: number | null }>> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_GET_UTTERANCES, payload),
    getSessions: (projectPath: string): Promise<Array<{ id: number; project_id: string | null; started_at: string; ended_at: string | null }>> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_GET_SESSIONS, projectPath),
    startStream: (payload: { sessionId: number; projectPath: string }): Promise<void> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_START_STREAM, payload),
    sendAudioChunk: (payload: { sessionId: number; audioBuffer: ArrayBuffer; projectPath: string }): void =>
      ipcRenderer.send(IPC.ACTIVE_LISTENING_AUDIO_CHUNK, payload),
    stopStream: (payload: { sessionId: number }): Promise<void> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_STOP_STREAM, payload),
    onUtterance: (callback: (evt: { sessionId: number; utterance_id: number; speaker_name: string | null; text: string }) => void): (() => void) => {
      const handler = (_e: unknown, evt: { sessionId: number; utterance_id: number; speaker_name: string | null; text: string }): void => callback(evt)
      ipcRenderer.on(IPC.ACTIVE_LISTENING_UTTERANCE, handler)
      return () => { ipcRenderer.removeListener(IPC.ACTIVE_LISTENING_UTTERANCE, handler) }
    }
  },

  addRecentProject: (projectPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC.PROJECTS_ADD_RECENT, projectPath),

  removeRecentProject: (projectPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC.PROJECTS_REMOVE_RECENT, projectPath),

  // AI
  aiChat: (messages: { role: string; content: string }[], rootPath: string, sessionId: string): Promise<{ content: string; modifiedFiles: string[]; modelDisplay: string }> =>
    ipcRenderer.invoke(IPC.AI_CHAT, { messages, rootPath, sessionId }),

  aiCompress: (messages: { role: string; content: string }[]): Promise<{ role: string; content: string }[]> =>
    ipcRenderer.invoke(IPC.AI_COMPRESS, messages),

  aiGetSystemPrompt: (rootPath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.AI_GET_SYSTEM_PROMPT, rootPath),

  onAiFileModified: (callback: (data: { path: string }) => void): (() => void) => {
    const handler = (_event: unknown, data: { path: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_FILE_MODIFIED, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_FILE_MODIFIED, handler) }
  },

  onAiToolCallStart: (callback: (data: { id: string; name: string; params: Record<string, unknown> }) => void): (() => void) => {
    const handler = (_e: unknown, data: { id: string; name: string; params: Record<string, unknown> }): void => callback(data)
    ipcRenderer.on(IPC.AI_TOOL_CALL_START, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_TOOL_CALL_START, handler) }
  },

  onAiToolCallEnd: (callback: (data: { id: string; result: string; error: boolean }) => void): (() => void) => {
    const handler = (_e: unknown, data: { id: string; result: string; error: boolean }): void => callback(data)
    ipcRenderer.on(IPC.AI_TOOL_CALL_END, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_TOOL_CALL_END, handler) }
  },

  onAiThinking: (callback: (data: { content: string }) => void): (() => void) => {
    const handler = (_e: unknown, data: { content: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_THINKING, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_THINKING, handler) }
  },

  onAiToken: (callback: (data: { token: string }) => void): (() => void) => {
    const handler = (_e: unknown, data: { token: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_TOKEN, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_TOKEN, handler) }
  },

  onAiModelSelected: (callback: (data: { modelDisplay: string }) => void): (() => void) => {
    const handler = (_e: unknown, data: { modelDisplay: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_MODEL_SELECTED, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_MODEL_SELECTED, handler) }
  },

  onAiStreamReset: (callback: (data: { errorMessage: string; fallbackModel: string }) => void): (() => void) => {
    const handler = (_e: unknown, data: { errorMessage: string; fallbackModel: string }): void => callback(data)
    ipcRenderer.on(IPC.AI_STREAM_RESET, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_STREAM_RESET, handler) }
  },

  aiCancelGeneration: (): Promise<void> =>
    ipcRenderer.invoke(IPC.AI_CANCEL),

  onAiAskUser: (callback: (data: { questionId: string; question: string; options: string[] }) => void): (() => void) => {
    const handler = (_e: unknown, data: { questionId: string; question: string; options: string[] }): void => callback(data)
    ipcRenderer.on(IPC.AI_ASK_USER, handler)
    return () => { ipcRenderer.removeListener(IPC.AI_ASK_USER, handler) }
  },

  aiAskUserResponse: (questionId: string, answer: string): Promise<void> =>
    ipcRenderer.invoke(IPC.AI_ASK_USER_RESPONSE, { questionId, answer }),

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

  // Chat Sessions
  session: {
    list: (rootPath: string): Promise<Array<{ id: string; title: string; createdAt: number; updatedAt: number }>> =>
      ipcRenderer.invoke(IPC.SESSION_LIST, rootPath),
    load: (rootPath: string, sessionId: string): Promise<{ id: string; title: string; createdAt: number; updatedAt: number; messages: unknown[] } | null> =>
      ipcRenderer.invoke(IPC.SESSION_LOAD, rootPath, sessionId),
    save: (rootPath: string, session: { id: string; title: string; createdAt: number; updatedAt: number; messages: unknown[] }): Promise<void> =>
      ipcRenderer.invoke(IPC.SESSION_SAVE, rootPath, session),
    delete: (rootPath: string, sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SESSION_DELETE, rootPath, sessionId)
  },

  // Tools + Project settings
  tools: {
    list: (rootPath: string): Promise<unknown[]> =>
      ipcRenderer.invoke('tools:list', rootPath)
  },

  project: {
    getSettings: (rootPath: string): Promise<unknown> =>
      ipcRenderer.invoke('project:getSettings', rootPath),
    setSettings: (rootPath: string, patch: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('project:setSettings', rootPath, patch)
  },

  // Extensions
  extension: {
    list: (rootPath: string): Promise<{ installed: import('../shared/extension-types').InstalledExtension[] }> =>
      ipcRenderer.invoke(IPC.EXTENSION_LIST, rootPath),
    installFromDisk: (rootPath: string): Promise<{ ok: boolean; canceled?: boolean }> =>
      ipcRenderer.invoke(IPC.EXTENSION_INSTALL_FROM_DISK, rootPath),
    uninstall: (rootPath: string, id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.EXTENSION_UNINSTALL, rootPath, id),
    enable: (rootPath: string, id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.EXTENSION_ENABLE, rootPath, id),
    disable: (rootPath: string, id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.EXTENSION_DISABLE, rootPath, id),
    loadRendererCode: (rootPath: string, id: string): Promise<{ ok: boolean; code: string | null }> =>
      ipcRenderer.invoke(IPC.EXTENSION_LOAD_RENDERER, rootPath, id),
    loadMainModule: (rootPath: string, id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.EXTENSION_LOAD_MAIN, rootPath, id)
  },

  // Account auth
  auth: {
    login: (): Promise<void> =>
      ipcRenderer.invoke(IPC.AUTH_LOGIN),
    logout: (): Promise<void> =>
      ipcRenderer.invoke(IPC.AUTH_LOGOUT),
    getStatus: (): Promise<{ loggedIn: boolean; email: string; plan: string }> =>
      ipcRenderer.invoke(IPC.AUTH_GET_STATUS),
    onChanged: (callback: (data: { loggedIn: boolean; email: string }) => void): (() => void) => {
      const handler = (_e: unknown, data: { loggedIn: boolean; email: string }): void => callback(data)
      ipcRenderer.on(IPC.AUTH_CHANGED, handler)
      return () => { ipcRenderer.removeListener(IPC.AUTH_CHANGED, handler) }
    }
  },

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
