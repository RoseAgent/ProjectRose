// Per-Conversation background process registry.
//
// `run_command` with `run_in_background: true` spawns here and returns a
// `shell_id`. Processes survive across Turns — the Agent can start a dev
// server in one Turn and read its output in a later one — and are owned by
// the Conversation (`sessionId`): they are killed when the Conversation is
// deleted (ipc/index.ts) and when the app quits (main/index.ts calls
// `reapAllBackgroundProcesses` on will-quit).

import { spawn, type ChildProcess } from 'child_process'
import { platform } from 'os'
import { withAugmentedPath } from '../lib/childProcessEnv'

// Cap on retained output per process. Old output is dropped from the front;
// `read_process_output` reads are cursor-based so the Agent normally consumes
// output long before the cap trims anything it hasn't seen.
const OUTPUT_CAP = 200_000

interface BackgroundProcess {
  shellId: string
  command: string
  proc: ChildProcess
  output: string
  // How many chars of `output` have been dropped from the front by the cap.
  droppedChars: number
  // Absolute cursor (in never-trimmed coordinates) of the last read.
  readCursor: number
  exited: boolean
  exitCode: number | null
}

const byConversation = new Map<string, Map<string, BackgroundProcess>>()
let nextShellId = 1

function shellPath(): string {
  return platform() === 'win32' ? 'powershell.exe' : '/bin/bash'
}

export function spawnBackgroundProcess(
  sessionId: string,
  command: string,
  cwd: string
): string {
  const shellId = `shell_${nextShellId++}`
  const proc = spawn(command, [], {
    cwd,
    shell: shellPath(),
    env: withAugmentedPath(),
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const entry: BackgroundProcess = {
    shellId,
    command,
    proc,
    output: '',
    droppedChars: 0,
    readCursor: 0,
    exited: false,
    exitCode: null
  }

  const append = (chunk: Buffer): void => {
    entry.output += chunk.toString('utf-8')
    if (entry.output.length > OUTPUT_CAP) {
      const excess = entry.output.length - OUTPUT_CAP
      entry.output = entry.output.slice(excess)
      entry.droppedChars += excess
    }
  }
  proc.stdout?.on('data', append)
  proc.stderr?.on('data', append)
  proc.on('exit', (code) => {
    entry.exited = true
    entry.exitCode = code
  })
  proc.on('error', (err) => {
    entry.output += `\n[spawn error: ${err.message}]`
    entry.exited = true
    entry.exitCode = -1
  })

  let procs = byConversation.get(sessionId)
  if (!procs) {
    procs = new Map()
    byConversation.set(sessionId, procs)
  }
  procs.set(shellId, entry)
  return shellId
}

export interface ProcessOutputRead {
  found: boolean
  output?: string
  running?: boolean
  exitCode?: number | null
  command?: string
}

/** Return output produced since the previous read (cursor-based). */
export function readBackgroundProcessOutput(sessionId: string, shellId: string): ProcessOutputRead {
  const entry = byConversation.get(sessionId)?.get(shellId)
  if (!entry) return { found: false }
  const absoluteEnd = entry.droppedChars + entry.output.length
  const start = Math.max(entry.readCursor, entry.droppedChars)
  const unread = entry.output.slice(start - entry.droppedChars)
  entry.readCursor = absoluteEnd
  return {
    found: true,
    output: unread,
    running: !entry.exited,
    exitCode: entry.exitCode,
    command: entry.command
  }
}

export function killBackgroundProcess(sessionId: string, shellId: string): { found: boolean; wasRunning?: boolean } {
  const entry = byConversation.get(sessionId)?.get(shellId)
  if (!entry) return { found: false }
  const wasRunning = !entry.exited
  if (wasRunning) entry.proc.kill()
  byConversation.get(sessionId)?.delete(shellId)
  return { found: true, wasRunning }
}

/** List a Conversation's processes (for kill_process error messages). */
export function listBackgroundProcesses(sessionId: string): Array<{ shellId: string; command: string; running: boolean }> {
  const procs = byConversation.get(sessionId)
  if (!procs) return []
  return [...procs.values()].map((p) => ({ shellId: p.shellId, command: p.command, running: !p.exited }))
}

/** Kill and drop every process owned by a Conversation. */
export function reapConversationProcesses(sessionId: string): void {
  const procs = byConversation.get(sessionId)
  if (!procs) return
  for (const entry of procs.values()) {
    if (!entry.exited) entry.proc.kill()
  }
  byConversation.delete(sessionId)
}

/** App shutdown: kill everything. Wired to app 'will-quit'. */
export function reapAllBackgroundProcesses(): void {
  for (const sessionId of [...byConversation.keys()]) {
    reapConversationProcesses(sessionId)
  }
}
