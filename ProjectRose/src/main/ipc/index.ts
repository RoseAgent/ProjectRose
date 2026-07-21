import { registerDialogHandlers } from './dialogHandlers'
import { registerTerminalHandlers } from './terminalHandlers'
import { registerAppHandlers } from './appHandlers'
import { registerLspHandlers } from './lspHandlers'
import { registerActiveSpeechHandlers } from './activeSpeechHandlers'
import { registerSkillHandlers } from './skillHandlers'
import { registerScreenHandlers } from './screenHandlers'
import { registerTtsManifest } from './ttsHandlers'

import { sessionIpc, externalIpc, workspacesIpc } from '../services/conversation.ipc'
import {
  loadConversation,
  saveConversation,
  appendTurnEvents,
  deleteConversation
} from '../services/conversationStore'
import { reapConversationProcesses } from '../services/backgroundProcesses'
import { clearConversationToolState } from '../services/conversationToolState'
import { buildWorkspaceGroupedList, listKnownWorkspaces } from '../services/workspaceRegistry'
import { getExternalTranscript, getExternalTranscriptUpdate } from '../services/externalSessions'

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

import { settingsIpc, healthIpc, searchIpc, type SearchProviderStatus } from '../services/settingsService.ipc'
import { readSettings, applySettingsPatch, checkServicesHealth } from '../services/settingsService'
import {
  saveSearchCredentials,
  clearSearchCredentials,
  searchCredentialsConfigured
} from '../services/search/searchCredentialsStore'
import { dopplerIpc } from '../services/dopplerImport.ipc'
import { dopplerPreview, dopplerApply } from '../services/dopplerImport'
import {
  dopplerSignIn,
  dopplerSignOut,
  cancelDopplerSignIn,
  getDopplerAuthStatus,
  dopplerListProjects,
  dopplerListConfigs
} from '../services/dopplerAuthService'

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

import { kimiAuthIpc } from '../services/kimiAuthService.ipc'
import {
  kimiSignIn,
  kimiSignOut,
  cancelKimiSignIn,
  getKimiAuthStatus,
  kimiSaveApiKey,
  kimiClearApiKey,
  listKimiModels
} from '../services/kimiAuthService'

import { bedrockAuthIpc } from '../services/bedrockAuthService.ipc'
import {
  getBedrockAuthStatus,
  bedrockSaveCredentials,
  bedrockClearCredentials,
  listBedrockModels
} from '../services/bedrockAuthService'

import { aiIpc } from '../services/aiService.ipc'
import { chat, compressToolNoise, getContextStatus } from '../services/aiService'
import { buildAgentMd, buildInjectedSections } from '../services/agentMd'
import { sessionRegistry } from '../services/sessionRegistry'

import { extensionIpc } from '../services/extensionService.ipc'
import { ensureRuntimeFor } from '../services/alwaysOnRuntimes'
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

import { contactsIpc } from '../services/contacts/contactsService.ipc'
import { eventsIpc } from '../services/calendar/eventsService.ipc'

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
  listContacts,
  listContactsDetailed,
  readContact,
  writeContact,
  deleteContact,
  newContact,
  addContactNote,
  removeContactNote,
  setContactKind,
  searchContacts
} from '../services/contacts/contacts'
import {
  googleGetStatus,
  googleSaveCredentials,
  googleClearCredentials,
  googleSignIn,
  googleSignOut,
  googlePreviewPull,
  googleApplyPull,
  googlePreviewPush,
  googleApplyPush
} from '../services/contacts/googleContacts'
import {
  createEvent as createCalendarEvent,
  updateEvent as updateCalendarEvent,
  deleteEvent as deleteCalendarEvent,
  readEvent as readCalendarEvent,
  listEventsForRange
} from '../services/calendar/calendar'
import {
  googleCalendarGetStatus,
  googleCalendarListCalendars,
  googleCalendarPreviewPull,
  googleCalendarApplyPull,
  googleCalendarPreviewPush,
  googleCalendarApplyPush
} from '../services/calendar/googleCalendar'
import { inviteAttendeesToEvent } from '../services/calendar/calendarInvite'

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

async function searchProviderStatus(): Promise<SearchProviderStatus> {
  const settings = await readSettings()
  return {
    provider: settings.search?.provider ?? null,
    keyStored: await searchCredentialsConfigured()
  }
}

// Wires every typed-manifest service. Called once at startup alongside
// registerAllHandlers() — see main/index.ts.
export function registerIpcManifests(): void {
  sessionIpc.register({
    listAll: buildWorkspaceGroupedList,
    load: loadConversation,
    save: saveConversation,
    appendEvents: appendTurnEvents,
    // Deleting a Conversation also reaps its background processes and drops
    // its per-conversation tool state (read-guard set, todos).
    delete: async (sessionId: string) => {
      await deleteConversation(sessionId)
      reapConversationProcesses(sessionId)
      clearConversationToolState(sessionId)
    }
  })
  externalIpc.register({
    getTranscript: getExternalTranscript,
    getTranscriptUpdate: getExternalTranscriptUpdate
  })
  workspacesIpc.register({
    listKnown: listKnownWorkspaces
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
  dopplerIpc.register({
    preview: dopplerPreview,
    apply: ({ access, targets }) => dopplerApply(access, targets),
    login: dopplerSignIn,
    logout: dopplerSignOut,
    cancel: cancelDopplerSignIn,
    getStatus: getDopplerAuthStatus,
    listProjects: dopplerListProjects,
    listConfigs: dopplerListConfigs
  })
  searchIpc.register({
    getStatus: searchProviderStatus,
    saveCredentials: async ({ provider, apiKey }) => {
      await saveSearchCredentials(provider, apiKey)
      return searchProviderStatus()
    },
    clearCredentials: async () => {
      await clearSearchCredentials()
      return searchProviderStatus()
    }
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
  kimiAuthIpc.register({
    login: kimiSignIn,
    logout: kimiSignOut,
    cancel: cancelKimiSignIn,
    getStatus: getKimiAuthStatus,
    saveApiKey: ({ apiKey }) => kimiSaveApiKey(apiKey),
    clearApiKey: kimiClearApiKey,
    listModels: listKimiModels
  })
  bedrockAuthIpc.register({
    getStatus: getBedrockAuthStatus,
    saveCredentials: bedrockSaveCredentials,
    clearCredentials: bedrockClearCredentials,
    listModels: listBedrockModels
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
    ensureBuiltinMains: async (rootPath: string) => {
      await ensureRuntimeFor(rootPath)
      return { ok: true }
    }
  })
  routinesIpc.register({
    list: routinesList,
    read: routinesRead,
    // Saving a routine may be the first rule in a Workspace that had no
    // runtime yet — bring it online so the new routine actually schedules
    // without waiting for a restart (ADR 0017).
    save: async (...args: Parameters<typeof routinesSave>) => {
      const result = await routinesSave(...args)
      await ensureRuntimeFor(args[0])
      return result
    },
    delete: routinesDelete,
    runNow: routinesRunNow,
    listRuns: routinesListRuns,
    readRun: routinesReadRun
  })
  channelsIpc.register({
    list: channelsList,
    read: channelsRead,
    save: async (...args: Parameters<typeof channelsSave>) => {
      const result = await channelsSave(...args)
      await ensureRuntimeFor(args[0])
      return result
    },
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
  contactsIpc.register({
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
    googleGetStatus,
    googleSaveCredentials,
    googleClearCredentials,
    googleSignIn,
    googleSignOut,
    googlePreviewPull,
    googleApplyPull,
    googlePreviewPush,
    googleApplyPush
  })
  eventsIpc.register({
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
    chat: ({ messages, rootPath, sessionId, model }) => chat(messages, rootPath, sessionId, model),
    contextStatus: ({ rootPath, messages, compression, model }) =>
      getContextStatus(rootPath, messages, compression, model),
    compressToolNoise: ({ rootPath, messages, full, model }) =>
      compressToolNoise(rootPath, messages, full, model),
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
