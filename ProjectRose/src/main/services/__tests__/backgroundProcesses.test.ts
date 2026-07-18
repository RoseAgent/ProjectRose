import { describe, it, expect, afterEach } from 'vitest'
import { randomUUID } from 'crypto'

import {
  spawnBackgroundProcess,
  readBackgroundProcessOutput,
  killBackgroundProcess,
  listBackgroundProcesses,
  reapConversationProcesses
} from '../backgroundProcesses'

const sessions: string[] = []

function newSession(): string {
  const id = `bg-test-${randomUUID()}`
  sessions.push(id)
  return id
}

afterEach(() => {
  for (const id of sessions.splice(0)) reapConversationProcesses(id)
})

async function waitFor(check: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 50))
  }
}

describe('background process registry', () => {
  it('captures output and reads are cursor-based', async () => {
    const sessionId = newSession()
    const shellId = spawnBackgroundProcess(sessionId, 'echo first-chunk', process.cwd())
    await waitFor(() => readBackgroundProcessOutput(sessionId, shellId).running === false)
    // Cursor already advanced past the output consumed by waitFor's polling —
    // spawn again to assert the split between reads.
    const shell2 = spawnBackgroundProcess(sessionId, 'echo second-chunk', process.cwd())
    await waitFor(() => {
      const r = readBackgroundProcessOutput(sessionId, shell2)
      return (r.output ?? '').includes('second-chunk') || r.running === false
    })
    const after = readBackgroundProcessOutput(sessionId, shell2)
    expect(after.found).toBe(true)
    expect(after.output ?? '').not.toContain('second-chunk')
  })

  it('reports unknown shell ids with the known list', () => {
    const sessionId = newSession()
    const read = readBackgroundProcessOutput(sessionId, 'shell_999')
    expect(read.found).toBe(false)
    expect(listBackgroundProcesses(sessionId)).toEqual([])
  })

  it('kill stops a running process and removes it', async () => {
    const sessionId = newSession()
    const sleep = process.platform === 'win32' ? 'Start-Sleep -Seconds 30' : 'sleep 30'
    const shellId = spawnBackgroundProcess(sessionId, sleep, process.cwd())
    const result = killBackgroundProcess(sessionId, shellId)
    expect(result.found).toBe(true)
    expect(result.wasRunning).toBe(true)
    expect(listBackgroundProcesses(sessionId)).toEqual([])
  })

  it('reapConversationProcesses drops every process for the conversation', () => {
    const sessionId = newSession()
    const sleep = process.platform === 'win32' ? 'Start-Sleep -Seconds 30' : 'sleep 30'
    spawnBackgroundProcess(sessionId, sleep, process.cwd())
    spawnBackgroundProcess(sessionId, sleep, process.cwd())
    expect(listBackgroundProcesses(sessionId)).toHaveLength(2)
    reapConversationProcesses(sessionId)
    expect(listBackgroundProcesses(sessionId)).toEqual([])
  })
})
