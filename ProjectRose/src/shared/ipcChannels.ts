export const IPC = {
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_CREATE: 'file:create',
  FILE_DELETE: 'file:delete',
  FILE_DELETE_DIR: 'file:deleteDir',
  FILE_RENAME: 'file:rename',
  FILE_CREATE_DIR: 'file:createDir',
  FILE_READ_DIR_TREE: 'file:readDirTree',

  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_SAVE_FILE: 'dialog:saveFile',

  TERMINAL_SPAWN: 'terminal:spawn',
  TERMINAL_WRITE: 'terminal:write',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_DISPOSE: 'terminal:dispose',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',

  WATCHER_CHANGE: 'watcher:change',

  PROJECTS_GET_RECENT: 'projects:getRecent',
  PROJECTS_ADD_RECENT: 'projects:addRecent',
  PROJECTS_REMOVE_RECENT: 'projects:removeRecent',
  PROJECTS_GET_DEFAULT_PATH: 'projects:getDefaultPath',

  ROSE_CHECK_MD: 'rose:checkMd',
  ROSE_INIT_PROJECT: 'rose:initProject',
  ROSE_ENSURE_SCAFFOLD: 'rose:ensureScaffold',

  HEARTBEAT_RUN: 'heartbeat:run',
  HEARTBEAT_GET_LOGS: 'heartbeat:getLogs',
  HEARTBEAT_LOG_CONTENT: 'heartbeat:logContent',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  HEALTH_CHECK_ALL: 'health:checkAll',

  WHISPER_TRANSCRIBE: 'whisper:transcribe',

  INDEXING_PROJECT: 'indexing:project',
  INDEXING_PROGRESS: 'indexing:progress',

  AI_CHAT: 'ai:chat',
  AI_COMPRESS: 'ai:compress',
  AI_GET_SYSTEM_PROMPT: 'ai:getSystemPrompt',
  AI_MODEL_SELECTED: 'ai:modelSelected',
  AI_STREAM_RESET: 'ai:streamReset',
  AI_FILE_MODIFIED: 'ai:fileModified',
  AI_TOOL_CALL_START: 'ai:toolCallStart',
  AI_TOOL_CALL_END: 'ai:toolCallEnd',
  AI_THINKING: 'ai:thinking',
  AI_TOKEN: 'ai:token',
  AI_CANCEL: 'ai:cancel',
  AI_ASK_USER: 'ai:askUser',
  AI_ASK_USER_RESPONSE: 'ai:askUserResponse',

  LSP_PY_TO_SERVER: 'lsp:py:toServer',
  LSP_PY_FROM_SERVER: 'lsp:py:fromServer',
  LSP_TS_TO_SERVER: 'lsp:ts:toServer',
  LSP_TS_FROM_SERVER: 'lsp:ts:fromServer',
  LSP_STARTED: 'lsp:started',
  LSP_STOPPED: 'lsp:stopped',

  // Chat Sessions
  SESSION_LIST: 'session:list',
  SESSION_LOAD: 'session:load',
  SESSION_SAVE: 'session:save',
  SESSION_DELETE: 'session:delete',

  // Extensions
  EXTENSION_LIST: 'extension:list',
  EXTENSION_INSTALL_FROM_DISK: 'extension:installFromDisk',
  EXTENSION_UNINSTALL: 'extension:uninstall',
  EXTENSION_ENABLE: 'extension:enable',
  EXTENSION_DISABLE: 'extension:disable',
  EXTENSION_LOAD_RENDERER: 'extension:loadRenderer',
  EXTENSION_LOAD_MAIN: 'extension:loadMain',

  // Account auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_STATUS: 'auth:getStatus',
  AUTH_CHANGED: 'auth:changed',

  // Active Listening
  ACTIVE_LISTENING_LABEL_SPEAKER: 'activeSpeech:labelSpeaker',
  ACTIVE_LISTENING_TRAIN: 'activeSpeech:train',
  ACTIVE_LISTENING_TRAIN_STATUS: 'activeSpeech:trainStatus',
  ACTIVE_LISTENING_TRAIN_HISTORY: 'activeSpeech:trainHistory',
  ACTIVE_LISTENING_GET_SPEAKERS: 'activeSpeech:getSpeakers',
  ACTIVE_LISTENING_CREATE_SPEAKER: 'activeSpeech:createSpeaker',
  ACTIVE_LISTENING_ADD_SAMPLE: 'activeSpeech:addSample',
  ACTIVE_LISTENING_CREATE_SESSION: 'activeSpeech:createSession',
  ACTIVE_LISTENING_END_SESSION: 'activeSpeech:endSession',
  ACTIVE_LISTENING_GET_UTTERANCES: 'activeSpeech:getUtterances',
  ACTIVE_LISTENING_GET_SESSIONS: 'activeSpeech:getSessions',
  ACTIVE_LISTENING_START_STREAM: 'activeSpeech:startStream',
  ACTIVE_LISTENING_AUDIO_CHUNK: 'activeSpeech:audioChunk',
  ACTIVE_LISTENING_STOP_STREAM: 'activeSpeech:stopStream',
  ACTIVE_LISTENING_UTTERANCE: 'activeSpeech:utterance'
} as const
