import { ipcMain } from 'electron'
import { join } from 'path'
import { writeFile, mkdir, access } from 'fs/promises'
import { execSync } from 'child_process'
import { IPC } from '../../shared/ipcChannels'
import { readSettings, writeSettings } from './settingsHandlers'
import { prPath } from '../lib/projectPaths'

const AUTONOMY_TEXT: Record<string, string> = {
  high: 'Once you have determined a task requires tool use, proceed without asking for confirmation between steps. Execute completely. Do not ask "shall I proceed?" — just act.',
  medium: 'Ask before any potentially destructive tool calls (deleting files, running system-modifying commands). Proceed autonomously for safe read and write operations.',
  low: 'Ask the user before executing any tool call.'
}

function buildRoseMd(name: string, identity: string, autonomy: string, userName: string): string {
  return `# ${name}

## Identity

${identity}

## People

User: ${userName}
Agent: ${name}

## How to respond

Reply in plain text. Only use tools when the user explicitly asks you to do something — read a file, run a command, search the code, etc. Never call tools for greetings, questions, or conversational messages.

${AUTONOMY_TEXT[autonomy] ?? AUTONOMY_TEXT.high}

## Context

You have a \`.projectrose/memory/\` folder with notes about people, places, and projects, and a \`.projectrose/heartbeat/notes/\` folder for recording new information. Use them when relevant to an actual task.
`
}

async function mkdirSafe(p: string): Promise<void> {
  await mkdir(p, { recursive: true })
}

async function touch(p: string): Promise<void> {
  await writeFile(p, '', { flag: 'wx' }).catch(() => {})
}

export function registerRoseSetupHandlers(): void {
  ipcMain.handle(IPC.ROSE_CHECK_MD, async (_event, rootPath: string) => {
    try {
      await access(prPath(rootPath, 'ROSE.md'))
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(
    IPC.ROSE_INIT_PROJECT,
    async (_event, payload: { rootPath: string; name: string; identity: string; autonomy: string; userName: string }) => {
      const { rootPath, name, identity, autonomy, userName } = payload

      // Persist userName and agentName to settings
      const current = await readSettings()
      await writeSettings({ ...current, userName: userName.trim(), agentName: name.trim() })

      // Write ROSE.md
      await writeFile(prPath(rootPath, 'ROSE.md'), buildRoseMd(name, identity, autonomy, userName), 'utf-8')

      // Create scaffold directories
      const dirs = [
        prPath(rootPath, 'memory', 'people'),
        prPath(rootPath, 'memory', 'places'),
        prPath(rootPath, 'memory', 'things'),
        prPath(rootPath, 'heartbeat', 'notes'),
        prPath(rootPath, 'heartbeat', 'tasks'),
        prPath(rootPath, 'heartbeat', 'logs'),
        prPath(rootPath, 'tools')
      ]
      for (const dir of dirs) {
        await mkdirSafe(dir)
        await touch(join(dir, '.gitkeep'))
      }

      // Bootstrap user.md
      await writeFile(
        prPath(rootPath, 'memory', 'people', 'user.md'),
        `# User\n\n_No information collected yet._\n`,
        { flag: 'wx' }
      ).catch(() => {})

      // Init git repo and make the first commit
      try {
        execSync('git init', { cwd: rootPath, stdio: 'ignore' })
        execSync('git add .projectrose/', { cwd: rootPath, stdio: 'ignore' })
        execSync('git commit -m "Initialize agent home"', { cwd: rootPath, stdio: 'ignore' })
      } catch {
        // git may not be installed or the directory may already be a repo with conflicts
      }
    }
  )

  ipcMain.handle(IPC.ROSE_ENSURE_SCAFFOLD, async (_event, rootPath: string) => {
    const dirs = [
      prPath(rootPath, 'memory', 'people'),
      prPath(rootPath, 'memory', 'places'),
      prPath(rootPath, 'memory', 'things'),
      prPath(rootPath, 'heartbeat', 'notes'),
      prPath(rootPath, 'heartbeat', 'tasks'),
      prPath(rootPath, 'heartbeat', 'logs'),
      prPath(rootPath, 'tools')
    ]
    for (const dir of dirs) {
      await mkdirSafe(dir)
      await touch(join(dir, '.gitkeep'))
    }
  })
}
