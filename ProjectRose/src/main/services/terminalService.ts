import * as pty from 'node-pty'
import { platform } from 'os'
import { existsSync } from 'fs'

interface TerminalSession {
  process: pty.IPty
  onDataDispose: pty.IDisposable
  onExitDispose: pty.IDisposable
}

const sessions = new Map<string, TerminalSession>()
let sessionCounter = 0

function getDefaultShell(): string {
  if (platform() === 'win32') {
    // Try PowerShell 7 first, then fall back to Windows PowerShell
    const pwsh7 = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
    if (existsSync(pwsh7)) return pwsh7
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

function getShellArgs(shell: string): string[] {
  // PowerShell needs -NoLogo for cleaner startup
  if (shell.includes('pwsh') || shell.includes('powershell')) {
    return ['-NoLogo']
  }
  return []
}

export function spawnTerminal(
  cwd: string,
  onData: (data: string) => void,
  onExit: (exitCode: number) => void
): string {
  const id = `terminal-${++sessionCounter}`
  const shell = getDefaultShell()
  const args = getShellArgs(shell)

  console.log(`Spawning terminal: shell=${shell}, cwd=${cwd}`)

  const proc = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: process.env as Record<string, string>
  })

  const onDataDispose = proc.onData(onData)
  const onExitDispose = proc.onExit(({ exitCode }) => {
    console.log(`Terminal ${id} exited with code ${exitCode}`)
    onExit(exitCode)
  })

  sessions.set(id, { process: proc, onDataDispose, onExitDispose })
  console.log(`Terminal ${id} spawned successfully (pid: ${proc.pid})`)
  return id
}

export function writeToTerminal(sessionId: string, data: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.process.write(data)
  }
}

export function resizeTerminal(
  sessionId: string,
  cols: number,
  rows: number
): void {
  const session = sessions.get(sessionId)
  if (session && cols > 0 && rows > 0) {
    session.process.resize(cols, rows)
  }
}

export function disposeTerminal(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.onDataDispose.dispose()
    session.onExitDispose.dispose()
    try { session.process.kill() } catch {}
    sessions.delete(sessionId)
    console.log(`Terminal ${sessionId} disposed`)
  }
}

export function disposeAllTerminals(): void {
  for (const id of sessions.keys()) {
    disposeTerminal(id)
  }
}
