import { platform } from 'os'
import { readFile } from 'fs/promises'
import { prPath } from '../lib/projectPaths'
import { BrowserWindow } from 'electron'
import { setActiveProjectRoot } from './toolHandlers'
import { discoverPythonTools, getModifiedFiles, resetModifiedFiles } from './toolHandlers'
import { streamChat, compressMessages, routeRequest, createChecklist, evaluateChecklist } from './llmClient'
import { readSettings } from '../ipc/settingsHandlers'
import type { AppSettings, ModelConfig } from '../ipc/settingsHandlers'
import { readProjectSettings, CORE_TOOL_NAMES } from '../ipc/projectSettingsHandlers'
import { listInstalledExtensions } from '../ipc/extensionHandlers'
import { getAllBuiltinExtensionTools } from '../extensions/builtinTools'
import { IPC } from '../../shared/ipcChannels'
import type { Message } from '../../shared/roseModelTypes'

function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

// ── System prompt ──

const FALLBACK_AGENT_MD = `You are ProjectRose AI, a coding assistant embedded in the ProjectRose IDE.

Reply in plain text. Only use tools when the user explicitly asks you to do something — read a file, run a command, search the code, etc. Never call tools for greetings, questions, or conversational messages.

## Memory Palace

A memory palace is your long-term memory — a structured collection of notes that persists across conversations. It is organized as wings → rooms → drawers. Wings group broad domains (people, code, project), rooms hold related sub-topics within a wing, and drawers are individual markdown documents. Everything lives under \`.projectrose/memory/\`. Always use your memory tools to navigate and update it — never use read_file or list_directory on the memory directory directly.

At the start of every conversation:
1. List your palace to see what you already know.
2. Search for context if the user's message references a topic, person, or technology you may have encountered before.
3. Read any relevant drawers to load their full content.

During conversation, write to memory immediately when:
- The user mentions a preference, constraint, or decision
- You learn something new about the codebase, project, or architecture
- A new person or team is introduced
- The user corrects you or changes direction

**Naming — always specific, never generic:**
- Wing names must be precise. For project-specific work, name the wing after the actual project (e.g. `wing_projectrose`, `wing_mywebapp`) — never `wing_project`.
- Room names must describe the exact sub-topic (e.g. `room_auth_redesign`, `room_payment_api`, `room_onboarding_flow`) — never broad labels like `room_architecture` or `room_code`.
- If the name could apply to any project or session, it is too generic and will pollute future conversations. Make it specific enough that it could only refer to this exact topic.

Delete drawers when information becomes stale or outdated.
`

export async function buildAgentMd(rootPath: string): Promise<string> {
  const os = platform() === 'win32' ? 'Windows' : platform() === 'darwin' ? 'macOS' : 'Linux'
  const shell = platform() === 'win32' ? 'PowerShell' : 'bash'
  const date = new Date().toISOString().split('T')[0]

  let rose = FALLBACK_AGENT_MD
  try {
    rose = await readFile(prPath(rootPath, 'ROSE.md'), 'utf-8')
  } catch {
    // ROSE.md not yet created — use fallback
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

  const settings = await readSettings(rootPath)
  const userMessage = messages.at(-1)?.content ?? ''
  const selectedModel = await selectModel(userMessage, settings)
  const defaultModel = settings.models.find((m) => m.id === settings.defaultModelId) ?? settings.models[0]
  const modelDisplay = selectedModel.displayName || selectedModel.modelName
  notifyRenderer(IPC.AI_MODEL_SELECTED, { modelDisplay })

  const pythonTools = await discoverPythonTools(rootPath)
  const systemPrompt = await buildAgentMd(rootPath)

  const projectSettings = await readProjectSettings(rootPath)
  const { disabledTools, maxTaskRetries } = projectSettings
  const filteredPythonTools = pythonTools.filter((t) => !disabledTools.includes(t.name))
  const disabledCoreTools = disabledTools.filter((n) => CORE_TOOL_NAMES.has(n))

  const installed = await listInstalledExtensions(rootPath)
  const enabledExtIds = installed.filter((e) => e.enabled).map((e) => e.manifest.id)
  const extensionTools = getAllBuiltinExtensionTools(enabledExtIds)
    .filter((t) => !disabledTools.includes(t.name))

  const checklistMemory = await createChecklist(userMessage, selectedModel, settings.providerKeys)
  const chatMessages: Message[] = [...messages, { role: 'user', content: checklistMemory }]
  const streamParams = { systemPrompt, pythonTools: filteredPythonTools, extensionTools, providerKeys: settings.providerKeys, projectRoot: rootPath, disabledCoreTools }

  let responseText: string
  let activeModel = selectedModel
  let activeModelDisplay = modelDisplay

  try {
    responseText = await streamChat({ messages: chatMessages, model: selectedModel, ...streamParams })
  } catch (err) {
    const isAlreadyDefault = !defaultModel || selectedModel.id === defaultModel.id
    if (isAlreadyDefault) throw err

    const errorMessage = extractErrorMessage(err)
    const fallbackDisplay = defaultModel.displayName || defaultModel.modelName
    notifyRenderer(IPC.AI_STREAM_RESET, { errorMessage, fallbackModel: fallbackDisplay })
    resetModifiedFiles()

    responseText = await streamChat({ messages: chatMessages, model: defaultModel, ...streamParams })
    activeModel = defaultModel
    activeModelDisplay = fallbackDisplay
  }

  let currentMessages = chatMessages
  for (let attempt = 0; attempt < maxTaskRetries; attempt++) {
    const evaluation = await evaluateChecklist(checklistMemory, responseText, activeModel, settings.providerKeys)
    if (evaluation.trim() === 'DONE') break

    const injectionContent = `*Update Checklist*\nSome tasks are not yet complete:\n${evaluation}`
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: responseText },
      { role: 'user', content: injectionContent }
    ]
    responseText = await streamChat({ messages: currentMessages, model: activeModel, ...streamParams })
  }

  return { content: responseText, modifiedFiles: getModifiedFiles(), modelDisplay: activeModelDisplay }
}

export async function heartbeatChat(messages: Message[], rootPath: string): Promise<ChatResponse> {
  setActiveProjectRoot(rootPath)
  resetModifiedFiles()

  const settings = await readSettings(rootPath)
  const userMessage = messages.at(-1)?.content ?? ''
  const selectedModel = await selectModel(userMessage, settings)

  const projectSettings = await readProjectSettings(rootPath)
  const { maxTaskRetries } = projectSettings

  const heartbeatUserMessage = messages.at(-1)?.content ?? ''
  const checklistMemory = await createChecklist(heartbeatUserMessage, selectedModel, settings.providerKeys)
  const chatMessages: Message[] = [...messages, { role: 'user', content: checklistMemory }]
  const heartbeatStreamParams = {
    systemPrompt: HEARTBEAT_SYSTEM_PROMPT,
    pythonTools: [] as never[],
    model: selectedModel,
    providerKeys: settings.providerKeys,
    projectRoot: rootPath
  }

  let responseText = await streamChat({ messages: chatMessages, ...heartbeatStreamParams })

  let currentMessages = chatMessages
  for (let attempt = 0; attempt < maxTaskRetries; attempt++) {
    const evaluation = await evaluateChecklist(checklistMemory, responseText, selectedModel, settings.providerKeys)
    if (evaluation.trim() === 'DONE') break

    const injectionContent = `*Update Checklist*\nSome tasks are not yet complete:\n${evaluation}`
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: responseText },
      { role: 'user', content: injectionContent }
    ]
    responseText = await streamChat({ messages: currentMessages, ...heartbeatStreamParams })
  }

  const modelDisplay = selectedModel.displayName || selectedModel.modelName
  return { content: responseText, modifiedFiles: getModifiedFiles(), modelDisplay }
}

export async function compressHistory(messages: Message[]): Promise<Message[]> {
  const settings = await readSettings()
  const defaultModel = settings.models.find((m) => m.id === settings.defaultModelId) ?? settings.models[0]
  if (!defaultModel) return messages
  return compressMessages(messages, defaultModel, settings.providerKeys)
}
