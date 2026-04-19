import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipcChannels'

const api = {
  // Theme
  setNativeTheme: (theme: 'dark' | 'light'): void => {
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

  initProject: (payload: { rootPath: string; name: string; identity: string; autonomy: string }): Promise<void> =>
    ipcRenderer.invoke(IPC.ROSE_INIT_PROJECT, payload),

  runHeartbeat: (rootPath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.HEARTBEAT_RUN, rootPath),

  getHeartbeatLogs: (rootPath: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC.HEARTBEAT_GET_LOGS, rootPath),

  getHeartbeatLogContent: (rootPath: string, filename: string): Promise<string> =>
    ipcRenderer.invoke(IPC.HEARTBEAT_LOG_CONTENT, { rootPath, filename }),

  addRecentProject: (projectPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC.PROJECTS_ADD_RECENT, projectPath),

  removeRecentProject: (projectPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC.PROJECTS_REMOVE_RECENT, projectPath),

  // AI
  aiChat: (messages: { role: string; content: string }[], rootPath: string): Promise<{ content: string; modifiedFiles: string[] }> =>
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

  // Indexing
  indexProject: (rootPath: string): Promise<{ indexed: number; total: number; error?: string }> =>
    ipcRenderer.invoke(IPC.INDEXING_PROJECT, rootPath),

  indexFile: (filePath: string, content: string, rootPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.INDEXING_FILE, { filePath, content, rootPath }),

  onIndexingProgress: (callback: (progress: { phase: string; total: number; completed: number; message: string }) => void): (() => void) => {
    const handler = (_event: unknown, progress: { phase: string; total: number; completed: number; message: string }): void =>
      callback(progress)
    ipcRenderer.on(IPC.INDEXING_PROGRESS, handler)
    return () => {
      ipcRenderer.removeListener(IPC.INDEXING_PROGRESS, handler)
    }
  },

  // RoseLibrary
  roseHealth: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC.ROSE_HEALTH),

  roseCheckFiles: (files: { path: string; hash: string }[]): Promise<unknown> =>
    ipcRenderer.invoke(IPC.ROSE_CHECK_FILES, files),

  roseUpdateFiles: (files: { path: string; content: string }[]): Promise<unknown> =>
    ipcRenderer.invoke(IPC.ROSE_UPDATE_FILES, files),

  roseStatus: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC.ROSE_STATUS),

  roseSearch: (params: { query: string; limit?: number; metadata_weight?: number; code_weight?: number }): Promise<unknown> =>
    ipcRenderer.invoke(IPC.ROSE_SEARCH, params),

  roseFindReferences: (params: { symbol_name: string; file_path?: string; direction?: string }): Promise<unknown> =>
    ipcRenderer.invoke(IPC.ROSE_FIND_REFERENCES, params),

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
