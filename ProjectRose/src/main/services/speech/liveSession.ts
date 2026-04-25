import { Worker } from 'worker_threads'
import { app, BrowserWindow } from 'electron'
import path from 'path'
import { IPC } from '../../../shared/ipcChannels'
import { saveRecording } from './audioService'
import { identify } from './speakerService'
import * as db from './speechDB'

interface PendingJob {
  sessionId: number
  projectPath: string
  audioBuffer: ArrayBuffer
}

const activeSessions = new Set<number>()
const pendingJobs = new Map<number, PendingJob>()
let nextJobId = 0
let _worker: Worker | null = null

function getWorker(): Worker {
  if (_worker) return _worker

  _worker = new Worker(path.join(__dirname, 'speechWorker.js'), {
    workerData: { userDataPath: app.getPath('userData') }
  })

  _worker.on('message', handleWorkerMessage)
  _worker.on('error', (e) => console.error('[Speech] Worker error:', e))
  _worker.on('exit', (code) => {
    if (code !== 0) console.error(`[Speech] Worker exited with code ${code}`)
    _worker = null
  })

  return _worker
}

function handleWorkerMessage(msg: {
  type: string
  jobId?: number
  sessionId?: number
  projectPath?: string
  text?: string | null
  embedding?: number[] | null
  message?: string
}): void {
  if (msg.type === 'log') { console.log(msg.message); return }
  if (msg.type === 'error') { console.error('[SpeechWorker]', msg.message); return }
  if (msg.type !== 'result' || msg.jobId === undefined) return

  const job = pendingJobs.get(msg.jobId)
  if (!job) return
  pendingJobs.delete(msg.jobId)

  const { text, embedding } = msg
  if (!text) return

  const { sessionId, projectPath, audioBuffer } = job

  const { speakerId, confidence } = embedding
    ? identify(embedding, projectPath)
    : { speakerId: null, confidence: 0 }

  let speakerName: string | null = null
  if (speakerId !== null) {
    const speakers = db.getSpeakers(projectPath) as Array<{ id: number; name: string }>
    speakerName = speakers.find((s) => s.id === speakerId)?.name ?? null
  }

  const audioPath = saveRecording(projectPath, speakerId, audioBuffer)
  const recording = db.addRecording(projectPath, speakerId, audioPath, 'active_listening', projectPath, null)
  const utterance = db.createUtterance(projectPath, sessionId, recording.id, speakerId, text)

  console.log(
    `[Speech] utterance ${utterance.id}: "${text}" (speaker: ${speakerName ?? 'unknown'}, conf: ${confidence.toFixed(2)})`
  )

  const win = BrowserWindow.getAllWindows()[0]
  win?.webContents.send(IPC.ACTIVE_LISTENING_UTTERANCE, {
    type: 'utterance',
    sessionId,
    utterance_id: utterance.id,
    speaker_id: speakerId,
    speaker_name: speakerName,
    text
  })
}

export function startSession(sessionId: number, _projectPath: string): void {
  activeSessions.add(sessionId)
  getWorker() // pre-warm worker process
}

export function stopSession(sessionId: number): void {
  activeSessions.delete(sessionId)
}

export async function processChunk(
  sessionId: number,
  audioBuffer: ArrayBuffer,
  projectPath: string
): Promise<void> {
  if (!activeSessions.has(sessionId)) return

  const jobId = nextJobId++
  pendingJobs.set(jobId, { sessionId, projectPath, audioBuffer })

  // Send a copy to the worker so we keep the original for saveRecording
  getWorker().postMessage({
    type: 'processChunk',
    jobId,
    sessionId,
    audioBuffer: audioBuffer.slice(0),
    projectPath
  })
}
