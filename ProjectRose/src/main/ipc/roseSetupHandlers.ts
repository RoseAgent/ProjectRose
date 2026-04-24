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

const COMM_STYLE_TEXT: Record<string, string> = {
  direct: 'Be direct and concise. Get to the point. Never pad responses with filler phrases. Be honest when something is a bad idea — do not hedge.',
  collaborative: 'Think out loud. Share your reasoning as you work. Ask clarifying questions when intent is unclear. Treat the user as a partner.',
  adaptive: 'Match your communication style to the user and the task. Read context and adjust accordingly.'
}

const DEPTH_TEXT: Record<string, string> = {
  brief: 'Skip explanations unless asked. Give the answer, not the lecture.',
  detailed: 'Explain your reasoning. Include alternatives, trade-offs, and relevant context.',
  adaptive: 'Calibrate explanation depth to the complexity of the task. Simple questions get direct answers; complex problems get full context.'
}

const PROACTIVITY_TEXT: Record<string, string> = {
  reactive: 'Only address what is explicitly asked. Do not offer unsolicited feedback or suggestions.',
  balanced: 'Focus on the task, but flag obvious issues or risks you spot along the way.',
  proactive: 'Actively surface improvements, potential issues, and suggestions beyond the immediate request.'
}

export function buildRoseMd(
  name: string,
  identity: string,
  autonomy: string,
  userName: string,
  commStyle: string,
  depth: string,
  proactivity: string
): string {
  return `# ${name}

## Identity

${identity}

## People

User: ${userName}
Agent: ${name}

## Personality

${COMM_STYLE_TEXT[commStyle] ?? COMM_STYLE_TEXT.direct}

${DEPTH_TEXT[depth] ?? DEPTH_TEXT.adaptive}

${PROACTIVITY_TEXT[proactivity] ?? PROACTIVITY_TEXT.balanced}

## How to respond

Reply in plain text. Only use tools when the user explicitly asks you to do something — read a file, run a command, search the code, etc. Never call tools for greetings or purely conversational messages.

When you need clarification or a decision from the user before you can proceed, use the \`ask_user\` tool — do NOT ask questions in plain text. The \`ask_user\` tool pauses generation and shows the user an interactive prompt; it is the only correct way to ask questions mid-task.

${AUTONOMY_TEXT[autonomy] ?? AUTONOMY_TEXT.high}

## Coding Tasks

When asked to implement, fix, or modify code, always write directly to project files using tools — never paste code blocks in the response as the deliverable. The user cannot apply code from the chat; the only valid output is files written to disk.

**Approach:**
1. Use \`list_directory\` to orient yourself if the project structure is unfamiliar.
2. Use \`grep\` to find existing patterns, imports, or symbol usages before adding new code.
3. Use \`read_file\` on any file you intend to modify — this gives you the current content and the \`file_token\` required for writes.
4. Use \`edit_file\` for targeted changes (preferred). Use \`write_file\` only for new files or full rewrites.
5. After writing, run \`run_command\` to type-check, lint, or test if applicable.

**Tool reference:**

\`read_file\` — Read a file. Returns content and a \`file_token\`. Call this before editing any existing file — you cannot write without a valid token.

\`edit_file\` — Replace a unique string in a file with new content. Requires the \`file_token\` from a recent \`read_file\`. The \`old_string\` must appear exactly once — include enough surrounding lines to make it unique. Prefer this over \`write_file\` for partial changes so you do not accidentally overwrite unrelated content.

\`write_file\` — Write the full contents of a file. For new files, no token is needed. For existing files, requires a \`file_token\` from \`read_file\`. Use only for new files or complete rewrites.

\`list_directory\` — List files and subdirectories. Use \`.\` for the project root.

\`grep\` — Search file contents by regex. Use before adding imports or symbols to confirm they don't already exist.

\`run_command\` — Run a shell command in the project directory. Use to install packages, run tests, build, or lint after changes.

**Avoid these patterns:**
- Do not output code in the assistant message — write it to the file using tools.
- Do not call \`edit_file\` without a \`file_token\` from a preceding \`read_file\` on the same file.
- Do not guess file contents — always read first.
- Do not rewrite an entire file when only a targeted edit is needed.

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

Delete drawers when information becomes stale or outdated.
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
    async (_event, payload: { rootPath: string; name: string; identity: string; autonomy: string; userName: string; commStyle: string; depth: string; proactivity: string }) => {
      const { rootPath, name, identity, autonomy, userName, commStyle = 'direct', depth = 'adaptive', proactivity = 'balanced' } = payload

      // Persist userName and agentName to settings
      const current = await readSettings()
      await writeSettings({ ...current, userName: userName.trim(), agentName: name.trim() })

      // Write ROSE.md
      await writeFile(prPath(rootPath, 'ROSE.md'), buildRoseMd(name, identity, autonomy, userName, commStyle, depth, proactivity), 'utf-8')

      // Create scaffold directories
      const dirs = [
        prPath(rootPath, 'memory', 'wing_people', 'room_general'),
        prPath(rootPath, 'heartbeat', 'tasks'),
        prPath(rootPath, 'heartbeat', 'logs'),
        prPath(rootPath, 'tools')
      ]
      for (const dir of dirs) {
        await mkdirSafe(dir)
        await touch(join(dir, '.gitkeep'))
      }

      // Bootstrap identity drawer
      const today = new Date().toISOString().split('T')[0]
      await writeFile(
        prPath(rootPath, 'memory', 'wing_people', 'room_general', 'user.md'),
        `---\ntags: [people, identity]\nupdated: ${today}\n---\n\n# User\n\n_No information collected yet._\n`,
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
      prPath(rootPath, 'memory', 'wing_people', 'room_general'),
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
