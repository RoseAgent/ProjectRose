import { platform } from 'os'
import { readFile } from 'fs/promises'
import { prPath } from '../lib/projectPaths'
import { BrowserWindow } from 'electron'
import { setActiveProjectRoot } from './toolHandlers'
import { discoverPythonTools, getModifiedFiles, resetModifiedFiles } from './toolHandlers'
import { streamChat, compressMessages, routeRequest, cancelAllAskUserQuestions } from './llmClient'
import { readSettings } from '../ipc/settingsHandlers'
import type { AppSettings, ModelConfig } from '../ipc/settingsHandlers'
import { readProjectSettings, CORE_TOOL_NAMES } from '../ipc/projectSettingsHandlers'
import { listInstalledExtensions } from '../ipc/extensionHandlers'
import { getAllBuiltinExtensionTools } from '../extensions/builtinTools'
import { buildRoseMd } from '../ipc/roseSetupHandlers'
import { IPC } from '../../shared/ipcChannels'
import type { Message } from '../../shared/roseModelTypes'

let activeAbortController: AbortController | null = null

export function cancelActiveChat(): void {
  activeAbortController?.abort()
  cancelAllAskUserQuestions()
  activeAbortController = null
}

function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

// ── System prompt ──

export async function buildAgentMd(rootPath: string): Promise<string> {
  const os = platform() === 'win32' ? 'Windows' : platform() === 'darwin' ? 'macOS' : 'Linux'
  const shell = platform() === 'win32' ? 'PowerShell' : 'bash'
  const date = new Date().toISOString().split('T')[0]

  let rose: string
  try {
    rose = await readFile(prPath(rootPath, 'ROSE.md'), 'utf-8')
  } catch {
    const settings = await readSettings(rootPath).catch(() => ({ userName: '', agentName: '' }))
    rose = buildRoseMd(
      settings.agentName || 'Rose',
      'A coding assistant embedded in the ProjectRose IDE.',
      'high',
      settings.userName || 'User',
      'adaptive',
      'adaptive',
      'balanced'
    )
  }

  let identitySection = ''
  try {
    const raw = await readFile(prPath(rootPath, 'memory', 'wing_people', 'room_general', 'user.md'), 'utf-8')
    const body = raw.replace(/^---[\s\S]*?---\n/, '').trim()
    if (body && !body.includes('_No information collected yet._')) {
      identitySection = `\n\n## Known User Context\n${body}`
    }
  } catch {
    // no identity drawer yet
  }

  return `${rose}${identitySection}

## Environment
- Operating system: ${os}
- Shell: ${shell} (run_command uses ${shell})
- Use ${shell} syntax for all commands (e.g. ${platform() === 'win32' ? 'Get-ChildItem, Get-Content, Test-Path' : 'ls, cat, test'})
- Today's date: ${date}

## CRITICAL — Code output rule
Never write code or file contents in your response text. Every line of code must be written to disk using write_file or edit_file. If you catch yourself about to open a code block in your response, stop immediately and use the tools instead. This rule has no exceptions.

## CRITICAL — File tool rule
To create or overwrite a file use write_file. To make a targeted change to an existing file use edit_file. To read a file use read_file. Never use run_command for any file operation — no echo, cat, tee, touch, mkdir, shell redirects, or heredocs to produce file content. Shell-based file creation is unreliable: it creates directories instead of files, silently drops content, and corrupts paths. Use the dedicated file tools every time, without exception.

## CRITICAL — Question rule
Never ask the user a question in your response text. If you need clarification or a decision before proceeding, you must use the ask_user tool — that is its sole purpose. Asking questions as plain text is broken behaviour: the user cannot respond to them in a structured way and it stalls the task. If you are uncertain, make a reasonable assumption and proceed, or use ask_user. Never do both.

`
}

const HEARTBEAT_SYSTEM_PROMPT = `You are an autonomous agent processing a deferred work queue.
Execute every item completely. Do not ask for confirmation — just do the work.
Use available tools (read_file, write_file, run_command, list_directory) to accomplish each task.
`

// ── Error helpers ──

function extractErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const nested = parsed?.error as Record<string, unknown> | undefined
    const msg = nested?.message ?? parsed?.message ?? raw
    return String(msg)
  } catch {
    return raw
  }
}

// ── Model selection ──

async function selectModel(userMessage: string, settings: AppSettings): Promise<ModelConfig> {
  const { models, defaultModelId, router, hostMode, providerKeys } = settings
  if (models.length === 0) {
    throw new Error('No models configured. Please add a model in Settings → Chat.')
  }

  if (hostMode === 'projectrose') {
    if (!providerKeys.projectrose?.accessToken) {
      throw new Error('Sign in to your ProjectRose account to use the managed AI endpoint.')
    }
    return {
      id: 'projectrose-account',
      displayName: 'ProjectRose Account',
      provider: 'projectrose',
      modelName: 'managed',
      baseUrl: 'http://localhost:8000/api/openai',
      tags: ['account'],
    }
  }

  const defaultModel = models.find((m) => m.id === defaultModelId) ?? models[0]
  if (models.length === 1 || !router.enabled || !router.modelName) return defaultModel

  try {
    const category = await routeRequest(userMessage, router)
    const matched = models.find((m) =>
      m.tags.some(
        (tag) =>
          tag.toLowerCase().includes(category) || category.includes(tag.toLowerCase())
      )
    )
    return matched ?? defaultModel
  } catch {
    return defaultModel
  }
}

// ── Public API ──

export interface ChatResponse {
  content: string
  modifiedFiles: string[]
  modelDisplay: string
}

export async function chat(messages: Message[], rootPath: string): Promise<ChatResponse> {
  const abortController = new AbortController()
  activeAbortController = abortController

  try {
    setActiveProjectRoot(rootPath)
    resetModifiedFiles()

    const settings = await readSettings(rootPath)
    const userMessage = messages.at(-1)?.content ?? ''
    const selectedModel = await selectModel(userMessage, settings)
    const defaultModel = settings.models.find((m) => m.id === settings.defaultModelId) ?? settings.models[0]
    const modelDisplay = selectedModel.displayName || selectedModel.modelName
    notifyRenderer(IPC.AI_MODEL_SELECTED, { modelDisplay })

    const pythonTools = await discoverPythonTools(rootPath)
    const systemPrompt = await buildAgentMd(rootPath)

    const projectSettings = await readProjectSettings(rootPath)
    const { disabledTools } = projectSettings
    const filteredPythonTools = pythonTools.filter((t) => !disabledTools.includes(t.name))
    const disabledCoreTools = disabledTools.filter((n) => CORE_TOOL_NAMES.has(n))

    const installed = await listInstalledExtensions(rootPath)
    const enabledExtIds = installed.filter((e) => e.enabled).map((e) => e.manifest.id)
    const extensionTools = getAllBuiltinExtensionTools(enabledExtIds)
      .filter((t) => !disabledTools.includes(t.name))

    const streamParams = { systemPrompt, pythonTools: filteredPythonTools, extensionTools, providerKeys: settings.providerKeys, projectRoot: rootPath, disabledCoreTools, abortSignal: abortController.signal }

    let streamResult: Awaited<ReturnType<typeof streamChat>>
    let activeModelDisplay = modelDisplay
    let activeModel = selectedModel

    try {
      streamResult = await streamChat({ messages, model: selectedModel, ...streamParams })
    } catch (err) {
      if (abortController.signal.aborted) throw err
      const isAlreadyDefault = !defaultModel || selectedModel.id === defaultModel.id
      if (isAlreadyDefault) throw err

      const errorMessage = extractErrorMessage(err)
      const fallbackDisplay = defaultModel.displayName || defaultModel.modelName
      notifyRenderer(IPC.AI_STREAM_RESET, { errorMessage, fallbackModel: fallbackDisplay })
      resetModifiedFiles()

      streamResult = await streamChat({ messages, model: defaultModel, ...streamParams })
      activeModelDisplay = fallbackDisplay
      activeModel = defaultModel
    }

    return { content: streamResult.content, modifiedFiles: getModifiedFiles(), modelDisplay: activeModelDisplay }
  } finally {
    activeAbortController = null
  }
}

export async function heartbeatChat(messages: Message[], rootPath: string): Promise<ChatResponse> {
  setActiveProjectRoot(rootPath)
  resetModifiedFiles()

  const settings = await readSettings(rootPath)
  const userMessage = messages.at(-1)?.content ?? ''
  const selectedModel = await selectModel(userMessage, settings)

  const streamResult = await streamChat({
    messages,
    systemPrompt: HEARTBEAT_SYSTEM_PROMPT,
    pythonTools: [],
    model: selectedModel,
    providerKeys: settings.providerKeys,
    projectRoot: rootPath
  })

  const modelDisplay = selectedModel.displayName || selectedModel.modelName
  return { content: streamResult.content, modifiedFiles: getModifiedFiles(), modelDisplay }
}

export async function compressHistory(messages: Message[]): Promise<Message[]> {
  const settings = await readSettings()
  const defaultModel = settings.models.find((m) => m.id === settings.defaultModelId) ?? settings.models[0]
  if (!defaultModel) return messages
  return compressMessages(messages, defaultModel, settings.providerKeys)
}
