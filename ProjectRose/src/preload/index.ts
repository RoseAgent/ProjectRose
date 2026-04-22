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

  initProject: (payload: { rootPath: string; name: string; identity: string; autonomy: string; userName: string }): Promise<void> =>
    ipcRenderer.invoke(IPC.ROSE_INIT_PROJECT, payload),

  runHeartbeat: (rootPath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.HEARTBEAT_RUN, rootPath),

  getHeartbeatLogs: (rootPath: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC.HEARTBEAT_GET_LOGS, rootPath),

  getHeartbeatLogContent: (rootPath: string, filename: string): Promise<string> =>
    ipcRenderer.invoke(IPC.HEARTBEAT_LOG_CONTENT, { rootPath, filename }),

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
    getSpeakers: (): Promise<Array<{ id: number; name: string; created_at: string }>> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_GET_SPEAKERS),
    createSpeaker: (name: string): Promise<{ id: number; name: string }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_CREATE_SPEAKER, name),
    addSample: (payload: { speakerId: number; source: string; audioBuffer: ArrayBuffer; projectId?: string }): Promise<{ id: number }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_ADD_SAMPLE, payload),
    labelSpeaker: (payload: { utteranceId: number; speakerId?: number; speakerName?: string }): Promise<{ ok: boolean; speaker_id: number }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_LABEL_SPEAKER, payload),
    train: (): Promise<{ job_id: number }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_TRAIN),
    trainStatus: (jobId: number): Promise<{ status: string; accuracy: number | null; deployed: boolean; error: string | null }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_TRAIN_STATUS, jobId),
    trainHistory: (): Promise<Array<{ id: number; accuracy: number; is_active: boolean; trained_at: string; sample_count: number; notes: string | null }>> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_TRAIN_HISTORY),
    createSession: (projectId?: string): Promise<{ id: number }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_CREATE_SESSION, projectId),
    endSession: (sessionId: number): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_END_SESSION, sessionId),
    getUtterances: (sessionId: number): Promise<Array<{ id: number; text: string; speaker_name: string | null; speaker_id: number | null }>> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_GET_UTTERANCES, sessionId),
    getSessions: (): Promise<Array<{ id: number; project_id: string | null; started_at: string; ended_at: string | null }>> =>
      ipcRenderer.invoke(IPC.ACTIVE_LISTENING_GET_SESSIONS)
  },

  addRecentProject: (projectPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC.PROJECTS_ADD_RECENT, projectPath),

  removeRecentProject: (projectPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC.PROJECTS_REMOVE_RECENT, projectPath),

  // AI
  aiChat: (messages: { role: string; content: string }[], rootPath: string): Promise<{ content: string; modifiedFiles: string[]; modelDisplay: string }> =>
    ipcRenderer.invoke(IPC.AI_CHAT, { messages, rootPath }),

  aiCompress: (messages: { role: string; content: string }[]): Promise<{ role: string; content: string }[]> =>
    ipcRenderer.invoke(IPC.AI_COMPRESS, messages),

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

  // Docker
  docker: {
    check: (): Promise<{ installed: boolean; version?: string }> =>
      ipcRenderer.invoke(IPC.DOCKER_CHECK),
    listCompose: (rootPath: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.DOCKER_LIST_COMPOSE, rootPath),
    ps: (composeFiles: string[]): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC.DOCKER_PS, composeFiles),
    inspect: (id: string): Promise<unknown> =>
      ipcRenderer.invoke(IPC.DOCKER_INSPECT, id),
    start: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.DOCKER_START, id),
    stop: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.DOCKER_STOP, id),
    restart: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.DOCKER_RESTART, id),
    subscribeLogs: (id: string, opts?: { tail?: number }): Promise<string> =>
      ipcRenderer.invoke(IPC.DOCKER_LOGS_SUBSCRIBE, { id, tail: opts?.tail ?? 500 }),
    unsubscribeLogs: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.DOCKER_LOGS_UNSUBSCRIBE, sessionId),
    onLogsData: (callback: (payload: { sessionId: string; chunk: string }) => void): (() => void) => {
      const handler = (_e: unknown, p: { sessionId: string; chunk: string }): void => callback(p)
      ipcRenderer.on(IPC.DOCKER_LOGS_DATA, handler)
      return () => { ipcRenderer.removeListener(IPC.DOCKER_LOGS_DATA, handler) }
    },
    onLogsExit: (callback: (payload: { sessionId: string; code: number }) => void): (() => void) => {
      const handler = (_e: unknown, p: { sessionId: string; code: number }): void => callback(p)
      ipcRenderer.on(IPC.DOCKER_LOGS_EXIT, handler)
      return () => { ipcRenderer.removeListener(IPC.DOCKER_LOGS_EXIT, handler) }
    },
    listFiles: (id: string, path: string): Promise<{ entries: Array<{ name: string; type: string; size: number }> }> =>
      ipcRenderer.invoke(IPC.DOCKER_LIST_FILES, { id, path }),
    mounts: (id: string): Promise<Array<{ Source: string; Destination: string; Type: string }>> =>
      ipcRenderer.invoke(IPC.DOCKER_MOUNTS, id)
  },

  // Email
  email: {
    testConnection: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.EMAIL_TEST_CONN),
    fetchMessages: (): Promise<Array<{ uid: number; subject: string; from: string; date: string; read: boolean; folder: string; injectionDetected: boolean }>> =>
      ipcRenderer.invoke(IPC.EMAIL_FETCH_MESSAGES),
    fetchMessage: (uid: number): Promise<string> =>
      ipcRenderer.invoke(IPC.EMAIL_FETCH_MESSAGE, uid),
    deleteMessage: (uid: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.EMAIL_DELETE_MESSAGE, uid),
    getFilters: (): Promise<unknown> =>
      ipcRenderer.invoke(IPC.EMAIL_GET_FILTERS),
    setFilters: (patch: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke(IPC.EMAIL_SET_FILTERS, patch),
    getMeta: (): Promise<unknown> =>
      ipcRenderer.invoke(IPC.EMAIL_GET_META),
    setMessageFolder: (uid: number, folder: string): Promise<void> =>
      ipcRenderer.invoke(IPC.EMAIL_SET_MSG_FOLDER, uid, folder)
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

  // Discord
  discord: {
    connect: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.DISCORD_CONNECT),
    disconnect: (): Promise<void> =>
      ipcRenderer.invoke(IPC.DISCORD_DISCONNECT),
    getChannels: (): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC.DISCORD_GET_CHANNELS),
    fetchMessages: (channelId: string, limit: number, beforeId?: string): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC.DISCORD_FETCH_MESSAGES, channelId, limit, beforeId),
    sendMessage: (channelId: string, content: string): Promise<unknown> =>
      ipcRenderer.invoke(IPC.DISCORD_SEND_MESSAGE, channelId, content),
    onMessageCreate: (callback: (msg: unknown) => void): (() => void) => {
      const handler = (_e: unknown, msg: unknown): void => callback(msg)
      ipcRenderer.on(IPC.DISCORD_MESSAGE_CREATE, handler)
      return () => { ipcRenderer.removeListener(IPC.DISCORD_MESSAGE_CREATE, handler) }
    },
    onConnectionState: (callback: (state: { connected: boolean }) => void): (() => void) => {
      const handler = (_e: unknown, state: { connected: boolean }): void => callback(state)
      ipcRenderer.on(IPC.DISCORD_CONNECTION_STATE, handler)
      return () => { ipcRenderer.removeListener(IPC.DISCORD_CONNECTION_STATE, handler) }
    }
  },

  // Extensions
  extension: {
    list: (): Promise<{ installed: import('../shared/extension-types').InstalledExtension[] }> =>
      ipcRenderer.invoke(IPC.EXTENSION_LIST),
    install: (downloadUrl: string, extensionId?: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.EXTENSION_INSTALL, downloadUrl, extensionId),
    uninstall: (id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.EXTENSION_UNINSTALL, id),
    enable: (id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.EXTENSION_ENABLE, id),
    disable: (id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.EXTENSION_DISABLE, id),
    fetchRegistry: (registryUrl: string): Promise<import('../shared/extension-types').ExtensionRegistry> =>
      ipcRenderer.invoke(IPC.EXTENSION_FETCH_REGISTRY, registryUrl)
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

  // Git
  git: {
    isRepo: (cwd: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.GIT_IS_REPO, cwd),
    status: (cwd: string): Promise<unknown> =>
      ipcRenderer.invoke(IPC.GIT_STATUS, cwd),
    log: (cwd: string, opts?: { limit?: number; skip?: number; ref?: string; filePath?: string }): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC.GIT_LOG, { cwd, ...opts }),
    show: (cwd: string, sha: string): Promise<unknown> =>
      ipcRenderer.invoke(IPC.GIT_SHOW, { cwd, sha }),
    diffFile: (cwd: string, params: { sha: string; path: string }): Promise<{ oldContent: string; newContent: string; binary?: boolean }> =>
      ipcRenderer.invoke(IPC.GIT_DIFF_FILE, { cwd, ...params }),
    diffWorking: (cwd: string, params: { path: string; staged?: boolean }): Promise<{ oldContent: string; newContent: string; binary?: boolean }> =>
      ipcRenderer.invoke(IPC.GIT_DIFF_WORKING, { cwd, ...params }),
    branches: (cwd: string): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC.GIT_BRANCHES, cwd),
    checkout: (cwd: string, ref: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_CHECKOUT, { cwd, ref }),
    branchCreate: (cwd: string, params: { name: string; startPoint?: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_BRANCH_CREATE, { cwd, ...params }),
    branchDelete: (cwd: string, params: { name: string; force?: boolean }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_BRANCH_DELETE, { cwd, ...params }),
    branchRename: (cwd: string, params: { oldName: string; newName: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_BRANCH_RENAME, { cwd, ...params }),
    remotes: (cwd: string): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC.GIT_REMOTES, cwd),
    fetch: (cwd: string, remote?: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_FETCH, { cwd, remote }),
    pull: (cwd: string, params?: { remote?: string; branch?: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_PULL, { cwd, ...params }),
    push: (cwd: string, params?: { remote?: string; branch?: string; force?: boolean }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_PUSH, { cwd, ...params }),
    stage: (cwd: string, paths: string[]): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_STAGE, { cwd, paths }),
    unstage: (cwd: string, paths: string[]): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_UNSTAGE, { cwd, paths }),
    discard: (cwd: string, paths: string[]): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_DISCARD, { cwd, paths }),
    commit: (cwd: string, params: { message: string; amend?: boolean; allowEmpty?: boolean }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_COMMIT, { cwd, ...params }),
    cherryPick: (cwd: string, sha: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_CHERRY_PICK, { cwd, sha }),
    revert: (cwd: string, sha: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_REVERT, { cwd, sha }),
    merge: (cwd: string, ref: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_MERGE, { cwd, ref }),
    rebase: (cwd: string, ref: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_REBASE, { cwd, ref }),
    reset: (cwd: string, params: { target: string; mode: 'soft' | 'mixed' | 'hard' }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_RESET, { cwd, ...params }),
    tags: (cwd: string): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC.GIT_TAGS, cwd),
    tagCreate: (cwd: string, params: { name: string; ref?: string; message?: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_TAG_CREATE, { cwd, ...params }),
    tagDelete: (cwd: string, name: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_TAG_DELETE, { cwd, name }),
    stashes: (cwd: string): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC.GIT_STASHES, cwd),
    stashPush: (cwd: string, message?: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_STASH_PUSH, { cwd, message }),
    stashPop: (cwd: string, index?: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_STASH_POP, { cwd, index }),
    stashDrop: (cwd: string, index: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_STASH_DROP, { cwd, index }),
    stashApply: (cwd: string, index: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.GIT_STASH_APPLY, { cwd, index }),
    onHeadChanged: (callback: (payload: { cwd: string }) => void): (() => void) => {
      const handler = (_e: unknown, p: { cwd: string }): void => callback(p)
      ipcRenderer.on(IPC.GIT_HEAD_CHANGED, handler)
      return () => { ipcRenderer.removeListener(IPC.GIT_HEAD_CHANGED, handler) }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
