import { workerData, parentPort } from 'worker_threads'
import path from 'path'
import { initCacheDir as initWhisperCache, transcribe } from './whisperService'
import { initCacheDir as initSpeakerCache, embed } from './speakerService'
import { webmToWav, cleanupWav } from './audioService'

interface WorkerInit { userDataPath: string }
const { userDataPath } = workerData as WorkerInit

// initCacheDir in each service prepends 'hf-models' to this path
initWhisperCache(userDataPath)
initSpeakerCache(userDataPath)

interface ChunkJob {
  jobId: number
  sessionId: number
  audioBuffer: ArrayBuffer
  projectPath: string
}

const queue: ChunkJob[] = []
let busy = false

parentPort!.on('message', (msg: { type: string } & ChunkJob) => {
  if (msg.type !== 'processChunk') return

  if (queue.length >= 2) {
    queue.shift()
    parentPort!.postMessage({ type: 'log', message: '[SpeechWorker] Queue full, dropping oldest chunk' })
  }

  queue.push({
    jobId: msg.jobId,
    sessionId: msg.sessionId,
    audioBuffer: msg.audioBuffer,
    projectPath: msg.projectPath
  })

  if (!busy) drain()
})

function drain(): void {
  if (!queue.length) { busy = false; return }
  busy = true
  const job = queue.shift()!
  runJob(job)
    .catch((e) => parentPort!.postMessage({ type: 'error', message: String(e) }))
    .finally(() => drain())
}

async function runJob({ jobId, sessionId, audioBuffer, projectPath }: ChunkJob): Promise<void> {
  let wavPath: string | null = null
  try {
    wavPath = await webmToWav(audioBuffer)
    const text = await transcribe(wavPath)
    if (!text) {
      parentPort!.postMessage({ type: 'result', jobId, sessionId, projectPath, text: null, embedding: null })
      return
    }
    const embedding = await embed(wavPath)
    parentPort!.postMessage({ type: 'result', jobId, sessionId, projectPath, text, embedding })
  } finally {
    if (wavPath) cleanupWav(wavPath)
  }
}
