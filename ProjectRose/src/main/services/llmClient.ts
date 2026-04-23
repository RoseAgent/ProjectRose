import { streamText, generateText, stepCountIs, tool } from 'ai'
import type { ToolExecutionOptions } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOllama } from 'ai-sdk-ollama'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { z } from 'zod'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  handleReadFile,
  handleWriteFile,
  handleListDirectory,
  handleGrep,
  handleGetProjectOverview,
  handleRunCommand,
  handleMemoryWrite,
  handleMemoryRead,
  handleMemorySearch,
  handleMemoryList,
  handleMemoryDelete,
  type PythonToolMeta
} from './toolHandlers'
import { getAllBuiltinExtensionTools, type ExtensionToolEntry } from '../extensions/builtinTools'
import type { Message } from '../../shared/roseModelTypes'
import type { ModelConfig, RouterConfig, CompressionConfig } from '../ipc/settingsHandlers'

function notifyRenderer(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

type ProviderKeys = {
  anthropic: string
  openai: string
  bedrock?: { region: string; accessKeyId: string; secretAccessKey: string }
  projectrose?: { accessToken: string; refreshToken: string; email: string; plan: string } | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveModel(model: ModelConfig, providerKeys: ProviderKeys): any {
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
    case 'bedrock': {
      const creds = providerKeys.bedrock
      const provider = createAmazonBedrock({
        region: creds?.region || 'us-east-1',
        accessKeyId: creds?.accessKeyId || undefined,
        secretAccessKey: creds?.secretAccessKey || undefined
      })
      return provider(model.modelName)
    }
    case 'projectrose': {
      const token = providerKeys.projectrose?.accessToken ?? ''
      const provider = createOpenAI({
        apiKey: token,
        baseURL: model.baseUrl || 'https://projectrose.ai/api/ai'
      })
      return provider(model.modelName || 'managed')
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
    grep: tool({
      description: 'Search file contents for a regex pattern. Returns matching lines as file:line: text. Searches the entire project by default; narrow with path or include.',
      inputSchema: z.object({
        pattern: z.string().describe('Regex pattern to search for'),
        path: z.string().optional().describe('Directory to search in, relative to project root (default: entire project)'),
        include: z.string().optional().describe('Comma-separated file extensions to include, e.g. ".ts,.tsx" or "*.py"'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive match (default: false)')
      }),
      execute: wrapExecute('grep', handleGrep, projectRoot)
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
    }),
    memory_read: tool({
      description: 'Read the full contents of a specific memory drawer. Use this after memory_list or memory_search to retrieve the full content of a drawer.',
      inputSchema: z.object({
        wing: z.string().describe('Wing name without prefix, e.g. "people", "code", "project"'),
        room: z.string().describe('Room name without prefix, e.g. "general", "architecture", "decisions"'),
        drawer: z.string().describe('Drawer filename without .md extension')
      }),
      execute: wrapExecute('memory_read', handleMemoryRead, projectRoot)
    }),
    memory_write: tool({
      description: 'Create or update a memory drawer. Requires a memory_token obtained from a recent memory_search call — call memory_search first if you do not have one. Returns a new memory_token you can use for subsequent writes in the same session.',
      inputSchema: z.object({
        memory_token: z.string().optional().describe('Token from a recent memory_search call. Required — call memory_search first to obtain one.'),
        wing: z.string().describe('Wing name without prefix, e.g. "people", "code", "project"'),
        room: z.string().describe('Room name without prefix, e.g. "general", "architecture", "decisions"'),
        drawer: z.string().describe('Drawer filename without .md extension'),
        content: z.string().describe('Markdown body content to store'),
        tags: z.array(z.string()).optional().describe('Optional tags for categorization')
      }),
      execute: wrapExecute('memory_write', handleMemoryWrite, projectRoot)
    }),
    memory_search: tool({
      description: 'Keyword search across all memory drawers. Returns matching drawer paths with context snippets. Use this to recall relevant information before starting a task.',
      inputSchema: z.object({
        query: z.string().describe('Search terms to look for in memory drawers')
      }),
      execute: wrapExecute('memory_search', handleMemorySearch, projectRoot)
    }),
    memory_list: tool({
      description: 'List the full memory palace hierarchy: all wings, their rooms, and drawer names. Use this to get an overview of what is stored.',
      inputSchema: z.object({}),
      execute: wrapExecute('memory_list', (input, root) => handleMemoryList(input, root), projectRoot)
    }),
    memory_delete: tool({
      description: 'Delete a specific memory drawer. Use when information is outdated or no longer relevant.',
      inputSchema: z.object({
        wing: z.string().describe('Wing name without prefix'),
        room: z.string().describe('Room name without prefix'),
        drawer: z.string().describe('Drawer filename without .md extension')
      }),
      execute: wrapExecute('memory_delete', handleMemoryDelete, projectRoot)
    }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildExtensionTools(entries: ExtensionToolEntry[], projectRoot: string): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {}
  for (const entry of entries) {
    const shape: Record<string, z.ZodTypeAny> = {}
    const props = entry.schema?.properties ?? {}
    for (const [key, def] of Object.entries(props as Record<string, { type: string; description?: string; enum?: string[] }>)) {
      let zodType: z.ZodTypeAny
      if (def.enum) {
        zodType = z.enum(def.enum as [string, ...string[]])
      } else if (def.type === 'number') {
        zodType = z.number()
      } else {
        zodType = z.string()
      }
      const required = (entry.schema?.required as string[] | undefined)?.includes(key) ?? false
      shape[key] = required
        ? zodType.describe(def.description ?? '')
        : zodType.optional().describe(def.description ?? '')
    }
    result[entry.name] = tool({
      description: entry.description,
      inputSchema: z.object(shape),
      execute: wrapExecute(entry.name, entry.execute, projectRoot)
    })
  }
  return result
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
  providerKeys: ProviderKeys
  projectRoot: string
  disabledCoreTools?: string[]
}): Promise<void> {
  const { messages, systemPrompt, pythonTools, model: modelConfig, providerKeys, projectRoot, disabledCoreTools } = params
  const model = resolveModel(modelConfig, providerKeys)
  const tools = {
    ...buildCoreTools(projectRoot),
    ...buildExtensionTools(getAllBuiltinExtensionTools(), projectRoot),
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
  providerKeys: ProviderKeys
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
