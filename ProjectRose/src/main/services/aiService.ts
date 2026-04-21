import { platform } from 'os'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { BrowserWindow } from 'electron'
import { setActiveProjectRoot } from './toolHandlers'
import { discoverPythonTools, getModifiedFiles, resetModifiedFiles } from './toolHandlers'
import { streamChat, compressMessages, routeRequest } from './llmClient'
import { readSettings } from '../ipc/settingsHandlers'
import type { AppSettings, ModelConfig } from '../ipc/settingsHandlers'
import { readProjectSettings, CORE_TOOL_NAMES } from '../ipc/projectSettingsHandlers'
import { IPC } from '../../shared/ipcChannels'
import type { Message } from '../../shared/roseModelTypes'

function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

// ── System prompt ──

const FALLBACK_AGENT_MD = `You are RoseEditor AI, a coding assistant embedded in the RoseEditor IDE.

Reply in plain text. Only use tools when the user explicitly asks you to do something — read a file, run a command, search the code, etc. Never call tools for greetings, questions, or conversational messages.
`

async function buildAgentMd(rootPath: string): Promise<string> {
  const os = platform() === 'win32' ? 'Windows' : platform() === 'darwin' ? 'macOS' : 'Linux'
  const shell = platform() === 'win32' ? 'PowerShell' : 'bash'
  const date = new Date().toISOString().split('T')[0]

  let rose = FALLBACK_AGENT_MD
  try {
    rose = await readFile(join(rootPath, 'ROSE.md'), 'utf-8')
  } catch {
    // ROSE.md not yet created — use fallback
  }

  return `${rose}

## Environment
- Operating system: ${os}
- Shell: ${shell} (run_command uses ${shell})
- Use ${shell} syntax for all commands (e.g. ${platform() === 'win32' ? 'Get-ChildItem, Get-Content, Test-Path' : 'ls, cat, test'})
- Today's date: ${date}
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
  const { models, defaultModelId, router } = settings
  if (models.length === 0) {
    throw new Error('No models configured. Please add a model in Settings → Chat.')
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
  setActiveProjectRoot(rootPath)
  resetModifiedFiles()

  const settings = await readSettings()
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

  try {
    await streamChat({ messages, systemPrompt, pythonTools: filteredPythonTools, model: selectedModel, providerKeys: settings.providerKeys, projectRoot: rootPath, disabledCoreTools })
    return { content: '', modifiedFiles: getModifiedFiles(), modelDisplay }
  } catch (err) {
    const isAlreadyDefault = !defaultModel || selectedModel.id === defaultModel.id
    if (isAlreadyDefault) throw err

    const errorMessage = extractErrorMessage(err)
    const fallbackDisplay = defaultModel.displayName || defaultModel.modelName
    notifyRenderer(IPC.AI_STREAM_RESET, { errorMessage, fallbackModel: fallbackDisplay })
    resetModifiedFiles()

    await streamChat({ messages, systemPrompt, pythonTools: filteredPythonTools, model: defaultModel, providerKeys: settings.providerKeys, projectRoot: rootPath, disabledCoreTools })
    return { content: '', modifiedFiles: getModifiedFiles(), modelDisplay: fallbackDisplay }
  }
}

export async function heartbeatChat(messages: Message[], rootPath: string): Promise<ChatResponse> {
  setActiveProjectRoot(rootPath)
  resetModifiedFiles()

  const settings = await readSettings()
  const userMessage = messages.at(-1)?.content ?? ''
  const selectedModel = await selectModel(userMessage, settings)

  await streamChat({
    messages,
    systemPrompt: HEARTBEAT_SYSTEM_PROMPT,
    pythonTools: [],
    model: selectedModel,
    providerKeys: settings.providerKeys,
    projectRoot: rootPath
  })

  const modelDisplay = selectedModel.displayName || selectedModel.modelName
  return { content: '', modifiedFiles: getModifiedFiles(), modelDisplay }
}

export async function compressHistory(messages: Message[]): Promise<Message[]> {
  const settings = await readSettings()
  return compressMessages(messages, settings.compression, settings.providerKeys)
}
