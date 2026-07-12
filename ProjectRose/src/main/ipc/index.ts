import { registerDialogHandlers } from './dialogHandlers'
import { registerTerminalHandlers } from './terminalHandlers'
import { registerAppHandlers } from './appHandlers'
import { registerLspHandlers } from './lspHandlers'
import { registerActiveSpeechHandlers } from './activeSpeechHandlers'
import { registerSkillHandlers } from './skillHandlers'
import { registerScreenHandlers } from './screenHandlers'
import { registerTtsManifest } from './ttsHandlers'

import { sessionIpc } from '../services/sessionService.ipc'
import { listSessions, loadSession, saveSession, deleteSession } from '../services/sessionService'

import { promptIpc } from '../services/promptService.ipc'
import {
  readRosePrompt,
  writeRosePrompt,
  listExtensionPrompts,
  readExtensionPrompt,
  writeExtensionPrompt,
  resetExtensionPrompt
} from '../services/promptService'

import { skillIpc } from '../services/skillService.ipc'
import { listSkills, deleteSkill } from '../services/skillService'

import { interactionLogIpc } from '../services/interactionLog.ipc'
import { logInteraction, readRecentInteractions } from '../services/interactionLog'

import { fileIpc } from '../services/fileService.ipc'
import {
  readFileContent,
  writeFileContent,
  createFile,
  deleteFile,
  deleteDirectory,
  renameEntry,
  createDirectory,
  readDirectoryTree
} from '../services/fileService'

import { recentProjectsIpc } from '../services/recentProjects.ipc'
import {
  getRecentProjects,
  addRecentProject,
  removeRecentProject
} from '../services/recentProjects'

import { settingsIpc, healthIpc } from '../services/settingsService.ipc'
import { readSettings, applySettingsPatch, checkServicesHealth } from '../services/settingsService'

import { projectSettingsIpc, toolsIpc } from '../services/projectSettingsService.ipc'
import { readProjectSettings, writeProjectSettings, listTools } from '../services/projectSettingsService'

import { roseSetupIpc } from '../services/roseSetupService.ipc'
import { checkRoseMd, initRoseProject, ensureRoseScaffold } from '../services/roseSetupService'

import { whisperIpc } from '../services/whisperService.ipc'
import { transcribeAudio } from '../services/whisperService'
import {
  preloadWhisperModel,
  getPreloadStatus as getWhisperPreloadStatus,
  clearPreloadStatus as clearWhisperPreloadStatus
} from '../services/speech/modelPreloader'

import { updaterIpc } from '../services/updaterService.ipc'
import {
  checkForUpdatesNow,
  downloadUpdateNow,
  installUpdateAndRestart,
  skipVersion
} from '../services/updaterService'

import { authIpc, loginViaAuthWindow } from '../services/authService.ipc'
import { handleLogout, cancelPairing, getAuthStatus, fetchUsage } from '../services/authService'

import { aiIpc } from '../services/aiService.ipc'
import { chat, compressToolNoise, getContextStatus } from '../services/aiService'
import { buildAgentMd, buildInjectedSections } from '../services/agentMd'
import { sessionRegistry } from '../services/sessionRegistry'

import { extensionIpc } from '../services/extensionService.ipc'
import {
  loadAllBuiltinMains,
  unloadAllBuiltinMains
} from '../extensions/builtins'
import { routinesIpc } from '../extensions/builtins/rose-routines/routinesService.ipc'
import {
  listRoutines as routinesList,
  readRoutine as routinesRead,
  saveRoutine as routinesSave,
  deleteRoutine as routinesDelete,
  runNow as routinesRunNow,
  listRuns as routinesListRuns,
  readRun as routinesReadRun
} from '../extensions/builtins/rose-routines/main'
import { channelsIpc } from '../extensions/builtins/rose-channels/channelsService.ipc'
import {
  listRules as channelsList,
  readRule as channelsRead,
  saveRule as channelsSave,
  deleteRule as channelsDelete,
  runNow as channelsRunNow,
  listRuns as channelsListRuns,
  readRun as channelsReadRun,
  getStatus as channelsStatus,
  listDiscordChannels as channelsListDiscordChannels,
  listSlackChannels as channelsListSlackChannels,
  setDiscordToken as channelsSetDiscord,
  clearDiscord as channelsClearDiscord,
  setSlackTokens as channelsSetSlack,
  clearSlack as channelsClearSlack
} from '../extensions/builtins/rose-channels/main'
import {
  listExtensions,
  installFromGit,
  installFromDisk,
  installPreviewFromGit,
  installPreviewFromDisk,
  installConfirm,
  installCancel,
  uninstallExtension,
  enableExtension,
  disableExtension,
  loadRendererCode,
  loadMainModule
} from '../services/extensionService'

import { activeSpeechIpc } from '../services/speech/activeSpeechService.ipc'
import {
  getSpeakers,
  createSpeaker,
  addSample,
  labelSpeaker,
  startTrainingJob,
  getTrainingStatus,
  getTrainingHistory,
  getUtterances,
  getSessions,
  openSession,
  closeSession,
  prepareSession
} from '../services/speech/activeSpeechService'

import { memoryIpc } from '../services/memory/memoryService.ipc'

import { emailIpc } from '../services/email/emailService.ipc'
import {
  getEmailStatus,
  saveImapTransport,
  activateGoogleTransport,
  clearEmailTransport,
  listFolders as emailListFolders,
  listMessages as emailListMessages,
  search as emailSearch,
  getMessage as emailGetMessage,
  createDraft as emailCreateDraft,
  sendMessage as emailSendMessage,
  reply as emailReply,
  forward as emailForward,
  markRead as emailMarkRead,
  archiveMessage as emailArchive,
  moveMessage as emailMove,
  labelMessage as emailLabel,
  deleteMessage as emailDelete
} from '../services/email/emailService'
import {
  listDiaryIndex,
  readDiary,
  writeDiary,
  deleteDiary,
  listBehaviorRecords,
  readBehaviorRecord,
  writeBehaviorRecord,
  deleteBehaviorRecord,
  addBehaviorRecord,
  listContacts,
  listContactsDetailed,
  readContact,
  writeContact,
  deleteContact,
  newContact,
  addContactNote,
  removeContactNote,
  setContactKind,
  searchContacts,
  runDiaryNow,
  regenerateTodayDiary,
  getScheduleStatus,
  runContactsUpdaterNow,
  getContactsUpdaterStatus,
  googleGetStatus,
  googleSaveCredentials,
  googleClearCredentials,
  googleSignIn,
  googleSignOut,
  googlePreviewPull,
  googleApplyPull,
  googlePreviewPush,
  googleApplyPush,
  createEvent as createCalendarEvent,
  updateEvent as updateCalendarEvent,
  deleteEvent as deleteCalendarEvent,
  readEvent as readCalendarEvent,
  listEventsForRange,
  googleCalendarGetStatus,
  googleCalendarListCalendars,
  googleCalendarPreviewPull,
  googleCalendarApplyPull,
  googleCalendarPreviewPush,
  googleCalendarApplyPush,
  inviteAttendeesToEvent
} from '../services/memory'

// Hand-written handlers that don't fit the manifest pattern: dialog (needs
// the calling BrowserWindow), terminal (per-session webContents.send
// closures), lsp (per-window indexing progress), screen (capture source per
// webContents.id), the SKILLS_UPLOAD half of skills (file-dialog anchor),
// active-speech fire-and-forget chunks, and app.quit() for APP_QUIT.
export function registerAllHandlers(): void {
  registerDialogHandlers()
  registerTerminalHandlers()
  registerAppHandlers()
  registerLspHandlers()
  registerActiveSpeechHandlers()
  registerSkillHandlers()
  registerScreenHandlers()
}

// Wires every typed-manifest service. Called once at startup alongside
// registerAllHandlers() — see main/index.ts.
export function registerIpcManifests(): void {
  sessionIpc.register({
    list: listSessions,
    load: loadSession,
    save: saveSession,
    delete: deleteSession
  })
  promptIpc.register({
    readRose: readRosePrompt,
    writeRose: writeRosePrompt,
    readInjected: buildInjectedSections,
    listExtension: listExtensionPrompts,
    readExtension: readExtensionPrompt,
    writeExtension: writeExtensionPrompt,
    resetExtension: resetExtensionPrompt
  })
  skillIpc.register({
    list: listSkills,
    delete: deleteSkill
  })
  interactionLogIpc.register({
    log: (kind, target) => { logInteraction(kind, target) },
    list: (limit) => readRecentInteractions(limit)
  })
  fileIpc.register({
    read: readFileContent,
    write: ({ filePath, content }) => writeFileContent(filePath, content),
    create: createFile,
    delete: deleteFile,
    deleteDir: deleteDirectory,
    rename: ({ oldPath, newPath }) => renameEntry(oldPath, newPath),
    createDir: createDirectory,
    readDirTree: readDirectoryTree
  })
  recentProjectsIpc.register({
    getRecent: getRecentProjects,
    addRecent: addRecentProject,
    removeRecent: removeRecentProject
  })
  settingsIpc.register({
    get: readSettings,
    set: applySettingsPatch
  })
  healthIpc.register({
    checkAll: checkServicesHealth
  })
  projectSettingsIpc.register({
    getSettings: readProjectSettings,
    setSettings: writeProjectSettings
  })
  toolsIpc.register({
    list: listTools
  })
  roseSetupIpc.register({
    checkMd: checkRoseMd,
    initProject: initRoseProject,
    ensureScaffold: ensureRoseScaffold
  })
  whisperIpc.register({
    transcribe: transcribeAudio,
    preloadModel: preloadWhisperModel,
    getPreloadStatus: getWhisperPreloadStatus,
    clearPreloadStatus: clearWhisperPreloadStatus
  })
  updaterIpc.register({
    check: checkForUpdatesNow,
    download: downloadUpdateNow,
    install: installUpdateAndRestart,
    skipVersion: skipVersion
  })
  authIpc.register({
    login: loginViaAuthWindow,
    logout: handleLogout,
    cancel: cancelPairing,
    getStatus: getAuthStatus,
    getUsage: fetchUsage
  })
  extensionIpc.register({
    list: listExtensions,
    installFromGit,
    installFromDisk,
    installPreviewFromGit,
    installPreviewFromDisk,
    installConfirm,
    installCancel,
    uninstall: uninstallExtension,
    enable: enableExtension,
    disable: disableExtension,
    loadRendererCode,
    loadMainModule,
    loadBuiltinMains: async (rootPath: string) => {
      await loadAllBuiltinMains(rootPath)
      return { ok: true }
    },
    unloadBuiltinMains: async (rootPath: string) => {
      unloadAllBuiltinMains(rootPath)
      return { ok: true }
    }
  })
  routinesIpc.register({
    list: routinesList,
    read: routinesRead,
    save: routinesSave,
    delete: routinesDelete,
    runNow: routinesRunNow,
    listRuns: routinesListRuns,
    readRun: routinesReadRun
  })
  channelsIpc.register({
    list: channelsList,
    read: channelsRead,
    save: channelsSave,
    delete: channelsDelete,
    runNow: channelsRunNow,
    listRuns: channelsListRuns,
    readRun: channelsReadRun,
    status: channelsStatus,
    listDiscordChannels: channelsListDiscordChannels,
    listSlackChannels: channelsListSlackChannels,
    setDiscordToken: channelsSetDiscord,
    clearDiscord: channelsClearDiscord,
    setSlackTokens: channelsSetSlack,
    clearSlack: channelsClearSlack
  })
  activeSpeechIpc.register({
    getSpeakers,
    createSpeaker,
    addSample,
    labelSpeaker,
    train: startTrainingJob,
    trainStatus: getTrainingStatus,
    trainHistory: getTrainingHistory,
    getUtterances,
    getSessions,
    openSession,
    closeSession,
    prepareSession
  })
  memoryIpc.register({
    listDiary: listDiaryIndex,
    readDiary: readDiary,
    writeDiary: ({ dateKey, content }) => writeDiary(dateKey, content),
    deleteDiary: deleteDiary,
    listBehaviorRecords,
    readBehaviorRecord,
    writeBehaviorRecord: ({ filename, content }) => writeBehaviorRecord(filename, content),
    deleteBehaviorRecord,
    addBehaviorRecord,
    listContacts,
    listContactsDetailed,
    readContact,
    writeContact: ({ entity, content }) => writeContact(entity, content),
    deleteContact,
    newContact,
    addContactNote: ({ entity, note }) => addContactNote(entity, note),
    removeContactNote: ({ entity, note }) => removeContactNote(entity, note),
    setContactKind: ({ entity, kind }) => setContactKind(entity, kind),
    searchContacts,
    runDiaryNow,
    regenerateTodayDiary,
    getScheduleStatus,
    runContactsUpdaterNow,
    getContactsUpdaterStatus,
    googleGetStatus,
    googleSaveCredentials,
    googleClearCredentials,
    googleSignIn,
    googleSignOut,
    googlePreviewPull,
    googleApplyPull,
    googlePreviewPush,
    googleApplyPush,
    listEvents: listEventsForRange,
    getEvent: readCalendarEvent,
    createEvent: createCalendarEvent,
    updateEvent: ({ ref, patch }) => updateCalendarEvent(ref, patch),
    deleteEvent: deleteCalendarEvent,
    inviteToEvent: async ({ ref, attendees }) => {
      const outcome = await inviteAttendeesToEvent(ref, attendees)
      switch (outcome.status) {
        case 'no-event':
          return { appliedAt: Date.now(), ok: false, message: `No event at ${ref.date}/${ref.slug}.` }
        case 'not-synced':
          return { appliedAt: Date.now(), ok: false, message: 'Event not synced to Google. Push it first.' }
        case 'no-attendees':
          return { appliedAt: Date.now(), ok: false, message: 'No attendees provided.' }
        case 'sent':
          return outcome.result
      }
    },
    googleCalendarGetStatus,
    googleCalendarListCalendars,
    googleCalendarPreviewPull,
    googleCalendarApplyPull,
    googleCalendarPreviewPush,
    googleCalendarApplyPush
  })
  registerTtsManifest()
  emailIpc.register({
    getStatus: getEmailStatus,
    saveImap: saveImapTransport,
    activateGoogle: activateGoogleTransport,
    clearTransport: clearEmailTransport,
    listFolders: emailListFolders,
    listMessages: emailListMessages,
    search: emailSearch,
    getMessage: emailGetMessage,
    draftMessage: emailCreateDraft,
    sendMessage: emailSendMessage,
    reply: emailReply,
    forward: emailForward,
    markRead: ({ messageId, read }) => emailMarkRead(messageId, read),
    archive: emailArchive,
    move: ({ messageId, folder }) => emailMove(messageId, folder),
    label: ({ messageId, label, add }) => emailLabel(messageId, label, add),
    deleteMessage: emailDelete
  })
  aiIpc.register({
    chat: ({ messages, rootPath, sessionId }) => chat(messages, rootPath, sessionId),
    contextStatus: ({ rootPath, messages, compression }) =>
      getContextStatus(rootPath, messages, compression),
    compressToolNoise: ({ rootPath, messages, full }) => compressToolNoise(rootPath, messages, full),
    getSystemPrompt: buildAgentMd,
    // No-op when the session is gone — see comments on aiHandlers' originals
    // for why we don't fall back to "cancel the most recent".
    cancel: ({ sessionId }) => {
      sessionRegistry.get(sessionId)?.cancel()
    },
    askUserResponse: ({ sessionId, questionId, answer }) => {
      sessionRegistry.get(sessionId)?.resolveAskUserQuestion(questionId, answer)
    },
    captureScreenshotResult: ({ sessionId, requestId, result }) => {
      sessionRegistry.get(sessionId)?.resolveScreenshot(requestId, result)
    }
  })
}
