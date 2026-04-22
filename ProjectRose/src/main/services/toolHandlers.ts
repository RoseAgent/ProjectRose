import { readFile, writeFile, readdir, mkdir, unlink } from 'fs/promises'
import { join, relative, basename, dirname } from 'path'
import { prPath } from '../lib/projectPaths'
import { execSync } from 'child_process'
import { platform } from 'os'
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { lspRequest } from './lspManager'

const modifiedFiles: string[] = []
let _activeProjectRoot: string | null = null

export function resetModifiedFiles(): void {
  modifiedFiles.length = 0
}

export function getModifiedFiles(): string[] {
  return modifiedFiles.splice(0)
}

export function setActiveProjectRoot(rootPath: string): void {
  _activeProjectRoot = rootPath
}

function notifyRenderer(event: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(event, data)
    }
  }
}

export async function handleReadFile(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const filePath = String(input.path || '')
  const absolute = filePath.startsWith('/') || filePath.includes(':')
    ? filePath
    : join(projectRoot, filePath)
  return readFile(absolute, 'utf-8')
}

export async function handleWriteFile(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const filePath = String(input.path || '')
  const content = String(input.content || '')
  const absolute = filePath.startsWith('/') || filePath.includes(':')
    ? filePath
    : join(projectRoot, filePath)

  await writeFile(absolute, content, 'utf-8')
  modifiedFiles.push(absolute)
  notifyRenderer(IPC.AI_FILE_MODIFIED, { path: absolute })

  return `File written: ${filePath}`
}

export async function handleListDirectory(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const dirPath = String(input.path || '.')
  const absolute = dirPath.startsWith('/') || dirPath.includes(':')
    ? dirPath
    : join(projectRoot, dirPath)
  const entries = await readdir(absolute, { withFileTypes: true })
  return JSON.stringify(entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })))
}

export async function handleSearchCode(input: Record<string, unknown>): Promise<string> {
  const query = String(input.query || '')
  const limit = Number(input.limit) || 10

  // Try TypeScript server first (most projects are TS), then Python
  for (const server of ['ts', 'py'] as const) {
    try {
      const results = await lspRequest(server, 'workspace/symbol', { query }) as any[]
      if (!Array.isArray(results) || results.length === 0) continue
      const formatted = results.slice(0, limit).map((s: any) => ({
        name: s.name,
        kind: s.kind,
        location: s.location,
        containerName: s.containerName
      }))
      return JSON.stringify(formatted)
    } catch { /* try next server */ }
  }

  return JSON.stringify({ message: 'No language server available or no results found for: ' + query })
}

export async function handleFindReferences(input: Record<string, unknown>): Promise<string> {
  const symbolName = String(input.symbol_name || '')

  // Find the symbol location via workspace/symbol
  for (const server of ['ts', 'py'] as const) {
    try {
      const symbols = await lspRequest(server, 'workspace/symbol', { query: symbolName }) as any[]
      if (!Array.isArray(symbols) || symbols.length === 0) continue

      const target = symbols.find((s: any) => s.name === symbolName) ?? symbols[0]
      const loc = target.location
      if (!loc?.uri || !loc?.range) continue

      const refs = await lspRequest(server, 'textDocument/references', {
        textDocument: { uri: loc.uri },
        position: loc.range.start,
        context: { includeDeclaration: true }
      }) as any[]

      return JSON.stringify(Array.isArray(refs) ? refs : [])
    } catch { /* try next server */ }
  }

  return JSON.stringify({ message: 'No language server available or symbol not found: ' + symbolName })
}

export async function handleGetProjectOverview(): Promise<string> {
  return 'Project overview is not available in this version. Use search_code to find specific symbols.'
}

export async function handleRunCommand(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const command = String(input.command || '')
  const isWindows = platform() === 'win32'
  try {
    return execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      shell: isWindows ? 'powershell.exe' : '/bin/bash'
    })
  } catch (err: any) {
    return `Command failed (exit ${err.status || 1}):\n${err.stderr || err.message}`
  }
}

async function executePythonTool(toolName: string, input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const scriptName = toolName.replace(/^tool_/, '')
  const scriptPath = join(projectRoot, 'tools', `${scriptName}.py`)
  const isWindows = platform() === 'win32'
  const python = isWindows ? 'python' : 'python3'
  try {
    return execSync(`"${python}" "${scriptPath}"`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      input: JSON.stringify(input),
      timeout: 30000,
      maxBuffer: 1024 * 1024
    })
  } catch (err: any) {
    return `Tool ${scriptName} failed (exit ${err.status || 1}):\n${err.stderr || err.message}`
  }
}

function parsePythonDocstring(source: string): { description: string; parameters: Record<string, { type: string; description: string }> } | null {
  const match = source.match(/^"""([\s\S]*?)"""/)
  if (!match) return null
  const doc = match[1]
  const descMatch = doc.match(/description:\s*(.+)/)
  if (!descMatch) return null
  const description = descMatch[1].trim()
  const parameters: Record<string, { type: string; description: string }> = {}
  const paramSection = doc.match(/parameters:([\s\S]*)/)
  if (paramSection) {
    for (const line of paramSection[1].split('\n')) {
      const m = line.match(/^\s{2}(\w+):\s*(.+)/)
      if (m) parameters[m[1]] = { type: 'string', description: m[2].trim() }
    }
  }
  return { description, parameters }
}

export interface PythonToolMeta {
  name: string
  description: string
  parameters: Record<string, { type: string; description: string }>
  execute: (input: Record<string, unknown>, projectRoot: string) => Promise<string>
}

// ── Memory palace handlers ──

export async function handleMemoryWrite(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const wing = String(input.wing || '').replace(/[^a-z0-9_-]/gi, '_')
  const room = String(input.room || '').replace(/[^a-z0-9_-]/gi, '_')
  const drawer = String(input.drawer || '').replace(/[^a-z0-9_-]/gi, '_')
  const content = String(input.content || '')
  const tags = Array.isArray(input.tags) ? (input.tags as string[]) : []

  const drawerPath = prPath(projectRoot, 'memory', `wing_${wing}`, `room_${room}`, `${drawer}.md`)
  await mkdir(dirname(drawerPath), { recursive: true })

  const updated = new Date().toISOString().split('T')[0]
  const tagsLine = tags.length > 0 ? `[${tags.join(', ')}]` : '[]'
  await writeFile(drawerPath, `---\ntags: ${tagsLine}\nupdated: ${updated}\n---\n\n${content}`, 'utf-8')

  return `Memory written: wing_${wing}/room_${room}/${drawer}.md`
}

export async function handleMemorySearch(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const query = String(input.query || '')
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return 'No search query provided.'

  const memoryRoot = prPath(projectRoot, 'memory')
  const results: Array<{ relPath: string; snippet: string }> = []

  async function walkDir(dir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof readdir>>
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walkDir(fullPath)
      } else if (entry.name.endsWith('.md') && entry.name !== '.gitkeep') {
        if (results.length >= 10) continue
        try {
          const text = await readFile(fullPath, 'utf-8')
          const lower = text.toLowerCase()
          if (!terms.some((t) => lower.includes(t))) continue
          const lines = text.split('\n')
          const matchIdx = lines.findIndex((l) => terms.some((t) => l.toLowerCase().includes(t)))
          const start = Math.max(0, matchIdx - 2)
          const snippet = lines.slice(start, Math.min(lines.length, matchIdx + 3)).join('\n').trim()
          results.push({ relPath: relative(memoryRoot, fullPath).replace(/\\/g, '/'), snippet })
        } catch { /* skip */ }
      }
    }
  }

  await walkDir(memoryRoot)
  if (results.length === 0) return `No memories found matching: ${query}`
  return results.map((r) => `${r.relPath}\n  ${r.snippet.replace(/\n/g, '\n  ')}`).join('\n\n')
}

export async function handleMemoryList(_input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const memoryRoot = prPath(projectRoot, 'memory')
  let wingEntries: Awaited<ReturnType<typeof readdir>>
  try {
    wingEntries = await readdir(memoryRoot, { withFileTypes: true })
  } catch {
    return 'No memories stored yet.'
  }

  const wings = wingEntries.filter((e) => e.isDirectory() && e.name.startsWith('wing_'))
  if (wings.length === 0) return 'No memories stored yet.'

  const lines: string[] = []
  for (const wing of wings) {
    lines.push(wing.name)
    let roomEntries: Awaited<ReturnType<typeof readdir>>
    try {
      roomEntries = await readdir(join(memoryRoot, wing.name), { withFileTypes: true })
    } catch {
      continue
    }
    for (const room of roomEntries.filter((e) => e.isDirectory() && e.name.startsWith('room_'))) {
      lines.push(`  ${room.name}`)
      let drawerEntries: Awaited<ReturnType<typeof readdir>>
      try {
        drawerEntries = await readdir(join(memoryRoot, wing.name, room.name), { withFileTypes: true })
      } catch {
        continue
      }
      for (const d of drawerEntries.filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== '.gitkeep')) {
        lines.push(`    ${d.name.replace(/\.md$/, '')}`)
      }
    }
  }

  return lines.join('\n')
}

export async function handleMemoryDelete(input: Record<string, unknown>, projectRoot: string): Promise<string> {
  const wing = String(input.wing || '')
  const room = String(input.room || '')
  const drawer = String(input.drawer || '')
  const drawerPath = prPath(projectRoot, 'memory', `wing_${wing}`, `room_${room}`, `${drawer}.md`)
  try {
    await unlink(drawerPath)
    return `Memory deleted: wing_${wing}/room_${room}/${drawer}.md`
  } catch {
    return `Memory not found: wing_${wing}/room_${room}/${drawer}.md`
  }
}

export async function discoverPythonTools(rootPath: string): Promise<PythonToolMeta[]> {
  const toolsDir = prPath(rootPath, 'tools')
  let files: string[] = []
  try {
    files = (await readdir(toolsDir)).filter((f) => f.endsWith('.py'))
  } catch {
    return []
  }
  const tools: PythonToolMeta[] = []
  for (const file of files) {
    try {
      const source = await readFile(join(toolsDir, file), 'utf-8')
      const meta = parsePythonDocstring(source)
      if (!meta) continue
      const scriptName = basename(file, '.py')
      const toolName = `tool_${scriptName}`
      tools.push({
        name: toolName,
        description: meta.description,
        parameters: meta.parameters,
        execute: (input, root) => executePythonTool(toolName, input, root)
      })
    } catch {
      // skip unreadable scripts
    }
  }
  return tools
}
