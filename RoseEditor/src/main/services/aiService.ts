import { platform } from 'os'
import { RoseModelClient } from './roseModelClient'
import { setActiveProjectRoot } from './roseLibraryClient'
import {
  startCallbackServer,
  getCallbackBaseUrl,
  getModifiedFiles,
  updateProjectRoot
} from './aiCallbackServer'
import type { Tool, Message } from '../../shared/roseModelTypes'

const client = new RoseModelClient()

function buildTools(): Tool[] {
  const base = getCallbackBaseUrl()

  return [
    {
      name: 'read_file',
      description: 'Read the contents of a file. Use project-relative paths.',
      parameters: {
        path: { type: 'string', description: 'File path relative to the project root' }
      },
      callback_url: `${base}/tools/read_file`
    },
    {
      name: 'write_file',
      description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does. The code index is updated automatically.',
      parameters: {
        path: { type: 'string', description: 'File path relative to the project root' },
        content: { type: 'string', description: 'The full file content to write' }
      },
      callback_url: `${base}/tools/write_file`
    },
    {
      name: 'list_directory',
      description: 'List files and subdirectories in a directory.',
      parameters: {
        path: { type: 'string', description: 'Directory path relative to the project root. Use "." for the root.' }
      },
      callback_url: `${base}/tools/list_directory`
    },
    {
      name: 'search_code',
      description: 'Search the codebase using a natural language query. Returns matching functions, classes, and methods with their source code, ranked by relevance.',
      parameters: {
        query: { type: 'string', description: 'Natural language description of what you are looking for' },
        limit: { type: 'number', description: 'Max results to return (default 10)' }
      },
      callback_url: `${base}/tools/search_code`
    },
    {
      name: 'find_references',
      description: 'Find all references to or from a symbol. Use direction "inbound" to find callers, "outbound" to find dependencies, or "both" for all references.',
      parameters: {
        symbol_name: { type: 'string', description: 'Name of the function, class, or method' },
        file_path: { type: 'string', description: 'File where the symbol is defined (required if the name is ambiguous)' },
        direction: { type: 'string', description: '"inbound", "outbound", or "both" (default "both")' }
      },
      callback_url: `${base}/tools/find_references`
    },
    {
      name: 'run_command',
      description: 'Run a shell command in the project directory. Use for installing packages, running tests, linting, etc. Returns stdout/stderr.',
      parameters: {
        command: { type: 'string', description: 'The shell command to execute' }
      },
      callback_url: `${base}/tools/run_command`
    },
    {
      name: 'get_project_overview',
      description: 'Get a structured map of the entire project: every file with its language, symbols (functions, classes, methods), and dependency relationships. Call this when you need to understand the project layout or find where something is defined.',
      parameters: {},
      callback_url: `${base}/tools/get_project_overview`
    }
  ]
}

function buildAgentMd(): string {
  const os = platform() === 'win32' ? 'Windows' : platform() === 'darwin' ? 'macOS' : 'Linux'
  const shell = platform() === 'win32' ? 'PowerShell' : 'bash'

  let md = `You are RoseEditor AI, a coding assistant embedded in the RoseEditor IDE.

You help the user with their codebase by reading, writing, searching, and navigating code.

Environment:
- Operating system: ${os}
- Shell: ${shell} (run_command uses ${shell})
- Use ${shell} syntax for all commands (e.g. ${platform() === 'win32' ? 'Get-ChildItem, Get-Content, Test-Path' : 'ls, cat, test'})

Guidelines:
- Read files before modifying them to understand the existing code.
- Use search_code to find relevant code when you don't know where something is.
- Use find_references before renaming or removing functions to understand impact.
- When you write a file, provide the complete file content.
- Use run_command for tasks like running tests, installing packages, or checking build status.
- Be concise in your explanations. The user can see the code in the editor.
- Use get_project_overview when you need to understand the project layout or locate code.
`

  return md
}

export interface ChatResponse {
  content: string
  modifiedFiles: string[]
}

export async function chat(
  messages: Message[],
  rootPath: string
): Promise<ChatResponse> {
  // Ensure callback server is running
  await startCallbackServer(rootPath)
  updateProjectRoot(rootPath)
  setActiveProjectRoot(rootPath)

  const tools = buildTools()

  const content = await client.generate({
    messages,
    agent_md: buildAgentMd(),
    tools
  })

  // Collect any files modified during tool execution
  const modified = getModifiedFiles()

  return { content, modifiedFiles: modified }
}

export async function compressHistory(messages: Message[]): Promise<Message[]> {
  return client.compress(messages)
}
