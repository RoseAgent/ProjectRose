import { ipcMain } from 'electron'
import { join } from 'path'
import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { execSync } from 'child_process'
import { IPC } from '../../shared/ipcChannels'
import { heartbeatChat } from '../services/aiService'

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir)
    return entries.filter((f) => f.endsWith('.md') && f !== '.gitkeep')
  } catch {
    return []
  }
}

async function filterDueTasks(files: string[], tasksDir: string): Promise<string[]> {
  const now = new Date()
  const due: string[] = []
  for (const file of files) {
    try {
      const content = await readFile(join(tasksDir, file), 'utf-8')
      const match = content.match(/^---[\s\S]*?due:\s*(.+?)[\s\S]*?---/m)
      if (match) {
        const dueDate = new Date(match[1].trim())
        if (!isNaN(dueDate.getTime()) && dueDate <= now) {
          due.push(file)
        }
      }
    } catch {
      // skip unreadable files
    }
  }
  return due
}

function buildHeartbeatPrompt(rootPath: string, notes: string[], dueTasks: string[]): string {
  const parts: string[] = [
    `You are processing the deferred work queue for the project at: ${rootPath}`,
    '',
    'Your job:'
  ]

  if (notes.length > 0) {
    parts.push(
      '',
      `## Process Notes (${notes.length} files in heartbeat/notes/)`,
      ...notes.map((n) => `- ${n}`),
      '',
      'For each note: read it with read_file, determine which memory/ file it relates to',
      '(memory/people/, memory/places/, or memory/things/), then update or create that',
      'memory file. Finally, delete the note by writing an empty string to it or using',
      'run_command to remove it.'
    )
  }

  if (dueTasks.length > 0) {
    parts.push(
      '',
      `## Execute Due Tasks (${dueTasks.length} tasks in heartbeat/tasks/)`,
      ...dueTasks.map((t) => `- ${t}`),
      '',
      'For each due task: read the file, execute the described task using available tools,',
      'then update the status field in the YAML frontmatter to "completed".'
    )
  }

  parts.push('', 'Report concisely what you did for each item.')
  return parts.join('\n')
}

export async function runHeartbeat(rootPath: string): Promise<string> {
  const notesDir = join(rootPath, 'heartbeat', 'notes')
  const tasksDir = join(rootPath, 'heartbeat', 'tasks')
  const logsDir = join(rootPath, 'heartbeat', 'logs')

  const notes = await listMdFiles(notesDir)
  const allTasks = await listMdFiles(tasksDir)
  const dueTasks = await filterDueTasks(allTasks, tasksDir)

  if (notes.length === 0 && dueTasks.length === 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const logPath = join(logsDir, `${timestamp}.md`)
    const logContent = `# Heartbeat — ${new Date().toLocaleString()}\n\nNothing to process.\n`
    await writeFile(logPath, logContent, 'utf-8').catch(() => {})
    return 'Nothing to process.'
  }

  const prompt = buildHeartbeatPrompt(rootPath, notes, dueTasks)
  const { content } = await heartbeatChat([{ role: 'user', content: prompt }], rootPath)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = join(logsDir, `${timestamp}.md`)
  const logContent = `# Heartbeat — ${new Date().toLocaleString()}\n\n${content}\n`
  await writeFile(logPath, logContent, 'utf-8').catch(() => {})

  // Commit any changes the agent made to its own files. Never push.
  try {
    const status = execSync(
      'git status --porcelain -- ROSE.md memory/ heartbeat/ tools/',
      { cwd: rootPath, encoding: 'utf-8' }
    ).trim()

    if (status) {
      const label = new Date().toISOString().slice(0, 16).replace('T', ' ')
      execSync('git add ROSE.md memory/ heartbeat/ tools/', { cwd: rootPath, stdio: 'ignore' })
      execSync(`git commit -m "Heartbeat: update agent files [${label}]"`, { cwd: rootPath, stdio: 'ignore' })
    }
  } catch {
    // git not available or repo not initialised — skip silently
  }

  return content
}

async function getLogFiles(rootPath: string): Promise<string[]> {
  const logsDir = join(rootPath, 'heartbeat', 'logs')
  try {
    const files = await readdir(logsDir)
    const mdFiles = files.filter((f) => f.endsWith('.md') && f !== '.gitkeep')
    // Sort newest first
    const withStats = await Promise.all(
      mdFiles.map(async (f) => {
        const s = await stat(join(logsDir, f)).catch(() => null)
        return { name: f, mtime: s?.mtime ?? new Date(0) }
      })
    )
    return withStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()).map((x) => x.name)
  } catch {
    return []
  }
}

export function registerHeartbeatHandlers(): void {
  ipcMain.handle(IPC.HEARTBEAT_RUN, async (_event, rootPath: string) => {
    return runHeartbeat(rootPath)
  })

  ipcMain.handle(IPC.HEARTBEAT_GET_LOGS, async (_event, rootPath: string) => {
    return getLogFiles(rootPath)
  })

  ipcMain.handle(IPC.HEARTBEAT_LOG_CONTENT, async (_event, payload: { rootPath: string; filename: string }) => {
    const logPath = join(payload.rootPath, 'heartbeat', 'logs', payload.filename)
    return readFile(logPath, 'utf-8')
  })
}
