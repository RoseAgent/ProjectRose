import { streamText, generateText, stepCountIs, tool } from 'ai'
import type { ToolExecutionOptions } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOllama } from 'ai-sdk-ollama'
import { z } from 'zod'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  handleReadFile,
  handleWriteFile,
  handleListDirectory,
  handleSearchCode,
  handleFindReferences,
  handleGetProjectOverview,
  handleRunCommand,
  type PythonToolMeta
} from './toolHandlers'
import type { Message } from '../../shared/roseModelTypes'
import type { ModelConfig, RouterConfig, CompressionConfig } from '../ipc/settingsHandlers'

function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveModel(model: ModelConfig, providerKeys: { anthropic: string; openai: string }): any {
  switch (model.provider) {
    case 'openai': {
      const provider = createOpenAI({ apiKey: providerKeys.openai || undefined })
      return provider(model.modelName || 'gpt-4o')
    }
    case 'ollama': {
      const provider = createOllama({ baseURL: model.baseUrl || 'http://localhost:11434' })
      return provider(model.modelName || 'llama3', { think: true })
    }
    case 'openai-compatible': {
      const provider = createOpenAI({
        apiKey: 'not-needed',
        baseURL: model.baseUrl
      })
      return provider(model.modelName)
    }
    case 'anthropic':
    default: {
      const provider = createAnthropic({ apiKey: providerKeys.anthropic || undefined })
      return provider(model.modelName || 'claude-sonnet-4-6')
    }
  }
}

export async function routeRequest(userMessage: string, router: RouterConfig): Promise<string> {
  const provider = createOllama({ baseURL: router.baseUrl || 'http://localhost:11434' })
  const model = provider(router.modelName)
  const { text } = await generateText({
    model,
    messages: [{
      role: 'user' as const,
      content: `Categorize this request in one or two words:\n\n${userMessage}\n\nOutput only the category, nothing else.`
    }]
  })
  return text.trim().toLowerCase()
}

type ExecuteFn = (input: Record<string, unknown>, projectRoot: string) => Promise<string>

function wrapExecute(
  name: string,
  fn: ExecuteFn,
  projectRoot: string
): (input: Record<string, unknown>, options: ToolExecutionOptions) => Promise<string> {
  return async (input, options) => {
    const id = options.toolCallId
    notifyRenderer(IPC.AI_TOOL_CALL_START, { id, name, params: input })
    try {
      const result = await fn(input, projectRoot)
      notifyRenderer(IPC.AI_TOOL_CALL_END, { id, result, error: false })
      return result
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      notifyRenderer(IPC.AI_TOOL_CALL_END, { id, result: error, error: true })
      return error
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCoreTools(projectRoot: string): Record<string, any> {
  return {
    read_file: tool({
      description: 'Read the contents of a file. Use project-relative paths.',
      inputSchema: z.object({
        path: z.string().describe('File path relative to the project root')
      }),
      execute: wrapExecute('read_file', handleReadFile, projectRoot)
    }),
    write_file: tool({
      description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does. The code index is updated automatically.',
      inputSchema: z.object({
        path: z.string().describe('File path relative to the project root'),
        content: z.string().describe('The full file content to write')
      }),
      execute: wrapExecute('write_file', handleWriteFile, projectRoot)
    }),
    list_directory: tool({
      description: 'List files and subdirectories in a directory.',
      inputSchema: z.object({
        path: z.string().describe('Directory path relative to the project root. Use "." for the root.')
      }),
      execute: wrapExecute('list_directory', handleListDirectory, projectRoot)
    }),
    search_code: tool({
      description: 'Search the codebase using a natural language query. Returns matching functions, classes, and methods with their source code, ranked by relevance.',
      inputSchema: z.object({
        query: z.string().describe('Natural language description of what you are looking for'),
        limit: z.number().optional().describe('Max results to return (default 10)')
      }),
      execute: wrapExecute('search_code', (input) => handleSearchCode(input), projectRoot)
    }),
    find_references: tool({
      description: 'Find all references to or from a symbol. Use direction "inbound" to find callers, "outbound" to find dependencies, or "both" for all references.',
      inputSchema: z.object({
        symbol_name: z.string().describe('Name of the function, class, or method'),
        file_path: z.string().optional().describe('File where the symbol is defined (required if the name is ambiguous)'),
        direction: z.enum(['inbound', 'outbound', 'both']).optional().describe('"inbound", "outbound", or "both" (default "both")')
      }),
      execute: wrapExecute('find_references', (input) => handleFindReferences(input), projectRoot)
    }),
    run_command: tool({
      description: 'Run a shell command in the project directory. Use for installing packages, running tests, linting, etc. Returns stdout/stderr.',
      inputSchema: z.object({
        command: z.string().describe('The shell command to execute')
      }),
      execute: wrapExecute('run_command', handleRunCommand, projectRoot)
    }),
    get_project_overview: tool({
      description: 'Get a structured map of the entire project: every file with its language, symbols (functions, classes, methods), and dependency relationships.',
      inputSchema: z.object({}),
      execute: wrapExecute('get_project_overview', () => handleGetProjectOverview(), projectRoot)
    })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPythonTools(pythonTools: PythonToolMeta[], projectRoot: string): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {}
  for (const pt of pythonTools) {
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const [key, { type, description }] of Object.entries(pt.parameters)) {
      shape[key] = (type === 'number' ? z.number() : z.string()).describe(description)
    }
    result[pt.name] = tool({
      description: pt.description,
      inputSchema: z.object(shape),
      execute: wrapExecute(pt.name, (input, root) => pt.execute(input, root), projectRoot)
    })
  }
  return result
}

export async function streamChat(params: {
  messages: Message[]
  systemPrompt: string
  pythonTools: PythonToolMeta[]
  model: ModelConfig
  providerKeys: { anthropic: string; openai: string }
  projectRoot: string
  disabledCoreTools?: string[]
}): Promise<void> {
  const { messages, systemPrompt, pythonTools, model: modelConfig, providerKeys, projectRoot, disabledCoreTools } = params
  const model = resolveModel(modelConfig, providerKeys)
  const tools = {
    ...buildCoreTools(projectRoot),
    ...buildPythonTools(pythonTools, projectRoot)
  }
  for (const name of disabledCoreTools ?? []) delete tools[name]

  const coreMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content
  }))

  const result = streamText({
    model,
    system: systemPrompt,
    messages: coreMessages,
    tools,
    stopWhen: stepCountIs(100)
  })

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta':
        if (chunk.text) notifyRenderer(IPC.AI_TOKEN, { token: chunk.text })
        break
      case 'reasoning-delta':
        if (chunk.text) notifyRenderer(IPC.AI_THINKING, { content: chunk.text })
        break
      case 'error': {
        const e = chunk.error
        if (e instanceof Error) throw e
        const msg = (typeof e === 'object' && e !== null && 'message' in e)
          ? String((e as { message: unknown }).message)
          : JSON.stringify(e)
        throw new Error(msg)
      }
    }
  }
}

export async function compressMessages(
  messages: Message[],
  compression: CompressionConfig,
  providerKeys: { anthropic: string; openai: string }
): Promise<Message[]> {
  if (messages.length <= 40) return messages

  const half = Math.floor(messages.length / 2)
  const firstHalf = messages.slice(0, half)
  const secondHalf = messages.slice(half)

  const compressModelConfig: ModelConfig = {
    id: '',
    displayName: '',
    provider: compression.provider,
    modelName: compression.modelName,
    baseUrl: compression.baseUrl,
    tags: []
  }

  const model = resolveModel(compressModelConfig, providerKeys)
  const conversationText = firstHalf
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  const { text } = await generateText({
    model,
    messages: [{
      role: 'user' as const,
      content: `Summarize the following conversation concisely, preserving key context and decisions:\n\n${conversationText}`
    }]
  })

  return [
    { role: 'user', content: `Previous conversation summary:\n${text}` },
    ...secondHalf
  ]
}
