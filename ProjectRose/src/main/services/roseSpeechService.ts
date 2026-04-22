import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import http from 'http'
import path from 'path'

let proc: ChildProcess | null = null

function getRoseSpeechDir(): string {
  if (app.isPackaged) {
    // Production: expect a bundled rosespeech executable in resources
    return path.join(process.resourcesPath, 'rosespeech')
  }
  return path.join(app.getAppPath(), '..', 'RoseSpeech')
}

function waitForReady(timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const check = (): void => {
      http
        .get('http://127.0.0.1:8040/speakers', (res) => {
          res.resume()
          resolve()
        })
        .on('error', () => {
          if (Date.now() > deadline) {
            reject(new Error('RoseSpeech did not become ready within 30s'))
            return
          }
          setTimeout(check, 500)
        })
    }
    check()
  })
}

export async function startRoseSpeech(): Promise<void> {
  const dir = getRoseSpeechDir()
  const python = process.platform === 'win32' ? 'python' : 'python3'

  if (app.isPackaged) {
    // Production: spawn the PyInstaller-bundled executable directly
    const exe = path.join(dir, process.platform === 'win32' ? 'rosespeech.exe' : 'rosespeech')
    proc = spawn(exe, [], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
  } else {
    proc = spawn(python, ['main.py'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ROSESPEECH_DATA_DIR: path.join(app.getPath('userData'), 'rosespeech')
      }
    })
  }

  proc.stdout?.on('data', (d: Buffer) => {
    for (const line of d.toString().trimEnd().split('\n')) {
      console.log('[RoseSpeech]', line)
    }
  })
  proc.stderr?.on('data', (d: Buffer) => {
    for (const line of d.toString().trimEnd().split('\n')) {
      console.error('[RoseSpeech]', line)
    }
  })
  proc.on('exit', (code) => {
    console.log(`[RoseSpeech] exited (code ${code})`)
    proc = null
  })

  try {
    await waitForReady()
    console.log('[RoseSpeech] ready on port 8040')
  } catch (e) {
    console.error('[RoseSpeech] failed to become ready:', e)
  }
}

export function stopRoseSpeech(): void {
  if (!proc || proc.pid == null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { shell: false })
  } else {
    proc.kill('SIGTERM')
  }
  proc = null
}
