import { ipcMain } from 'electron'
import { join } from 'path'
import { writeFile, mkdir, access } from 'fs/promises'
import { execSync } from 'child_process'
import { IPC } from '../../shared/ipcChannels'

const AUTONOMY_TEXT: Record<string, string> = {
  high: 'Never ask before using tools. Trust your own judgment. Execute tasks completely without waiting for user confirmation between steps. You are empowered to make decisions and act on them.',
  medium: 'Ask before any potentially destructive tool calls (deleting files, running system-modifying commands). Proceed autonomously for safe read and write operations.',
  low: 'Ask the user before executing any tool call.'
}

function buildRoseMd(name: string, identity: string, autonomy: string): string {
  return `# ${name}

## Identity

${identity}

## Autonomy

${AUTONOMY_TEXT[autonomy] ?? AUTONOMY_TEXT.high}

## Memory

The \`memory/\` folder is your long-term storage:
- \`memory/people/{name}.md\` — people the user mentions
- \`memory/places/{name}.md\` — locations and places
- \`memory/things/{name}.md\` — objects, projects, concepts

When the user mentions a person, place, or thing by name, use \`read_file\` to load
their context from the appropriate memory file before responding. If the file does
not exist yet, create a stub and make a note.

## Note-Taking

When you learn something new or updated about a person, place, or thing, write a
note using \`write_file\` to \`heartbeat/notes/{ISO-timestamp}-{subject}.md\`.
Do NOT update memory files directly during conversation. The heartbeat will
process notes and update memory files later.

## Tools

The \`tools/\` folder contains Python scripts. Each script has a docstring with
parameter descriptions. Run them via \`run_command\` (e.g. \`python tools/script.py\`
with JSON piped to stdin). If a task is likely to repeat, proactively create a
Python tool for it in \`tools/\` — no need to ask.

## Behavior

- Read files before modifying them.
- Use \`search_code\` when you don't know where something is.
- Use \`find_references\` before renaming or removing symbols.
- Use \`get_project_overview\` to understand project layout.
- Be concise. The user can see the code in the editor.
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
      await access(join(rootPath, 'ROSE.md'))
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(
    IPC.ROSE_INIT_PROJECT,
    async (_event, payload: { rootPath: string; name: string; identity: string; autonomy: string }) => {
      const { rootPath, name, identity, autonomy } = payload

      // Write ROSE.md
      await writeFile(join(rootPath, 'ROSE.md'), buildRoseMd(name, identity, autonomy), 'utf-8')

      // Create scaffold directories
      const dirs = [
        join(rootPath, 'memory', 'people'),
        join(rootPath, 'memory', 'places'),
        join(rootPath, 'memory', 'things'),
        join(rootPath, 'heartbeat', 'notes'),
        join(rootPath, 'heartbeat', 'tasks'),
        join(rootPath, 'heartbeat', 'logs'),
        join(rootPath, 'tools')
      ]
      for (const dir of dirs) {
        await mkdirSafe(dir)
        await touch(join(dir, '.gitkeep'))
      }

      // Bootstrap user.md
      await writeFile(
        join(rootPath, 'memory', 'people', 'user.md'),
        `# User\n\n_No information collected yet._\n`,
        { flag: 'wx' }
      ).catch(() => {})

      // Init git repo and make the first commit
      try {
        execSync('git init', { cwd: rootPath, stdio: 'ignore' })
        execSync('git add ROSE.md memory/ heartbeat/ tools/', { cwd: rootPath, stdio: 'ignore' })
        execSync('git commit -m "Initialize agent home"', { cwd: rootPath, stdio: 'ignore' })
      } catch {
        // git may not be installed or the directory may already be a repo with conflicts
      }
    }
  )
}
