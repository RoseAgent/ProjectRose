import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import * as speechDB from '../services/speech/speechDB'
import { saveRecording, webmPathToWav, cleanupWav } from '../services/speech/audioService'
import { train, getEmbedder, warmupEmbedder } from '../services/speech/speakerService'
import { startSession, stopSession, processChunk } from '../services/speech/liveSession'

// Tracks the current phase of in-flight training jobs so the UI can show
// "Downloading model..." vs "Training..." without a DB schema change.
const jobPhases = new Map<number, string>()

export function registerActiveSpeechHandlers(): void {
  // Pre-warm the WavLM model in background so the first Train click doesn't hang.
  warmupEmbedder()

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_GET_SPEAKERS,
    (_event, projectPath: string) => speechDB.getSpeakers(projectPath)
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_CREATE_SPEAKER,
    (_event, payload: { name: string; projectPath: string }) =>
      speechDB.createSpeaker(payload.projectPath, payload.name)
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_ADD_SAMPLE,
    async (
      _event,
      payload: {
        speakerId: number
        source: string
        audioBuffer: ArrayBuffer
        projectId?: string
        projectPath: string
      }
    ) => {
      const { speakerId, source, audioBuffer, projectId, projectPath } = payload
      const audioPath = saveRecording(projectPath, speakerId, audioBuffer)
      return speechDB.addRecording(projectPath, speakerId, audioPath, source, projectId ?? null, null)
    }
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_LABEL_SPEAKER,
    (
      _event,
      payload: {
        utteranceId: number
        speakerId?: number
        speakerName?: string
        projectPath: string
      }
    ) =>
      speechDB.labelSpeaker(
        payload.projectPath,
        payload.utteranceId,
        payload.speakerId ?? null,
        payload.speakerName ?? null
      )
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_TRAIN,
    async (_event, projectPath: string) => {
      const { job_id } = speechDB.createTrainingJob(projectPath)
      speechDB.updateTrainingJob(projectPath, job_id, { status: 'running' })

      // Run training async so we can return the job_id immediately
      setImmediate(async () => {
        try {
          const recordings = speechDB.getLabeledRecordings(projectPath)

          jobPhases.set(job_id, 'downloading-model')
          const embedder = await getEmbedder()
          if (!embedder) throw new Error('Speaker model unavailable — check internet connection and try again.')

          jobPhases.set(job_id, 'training')
          const { accuracy, deployed } = await train(projectPath, recordings, webmPathToWav, cleanupWav)

          jobPhases.delete(job_id)
          speechDB.updateTrainingJob(projectPath, job_id, {
            status: 'complete',
            accuracy,
            deployed
          })
          if (deployed) {
            speechDB.createModelVersion(projectPath, accuracy, recordings.length)
          }
        } catch (e) {
          jobPhases.delete(job_id)
          speechDB.updateTrainingJob(projectPath, job_id, {
            status: 'failed',
            error: e instanceof Error ? e.message : String(e)
          })
        }
      })

      return { job_id }
    }
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_TRAIN_STATUS,
    (_event, payload: { jobId: number; projectPath: string }) => {
      const job = speechDB.getTrainingJob(payload.projectPath, payload.jobId) as {
        status: string
        accuracy: number | null
        deployed: number
        error: string | null
      } | undefined
      if (!job) throw new Error(`Training job ${payload.jobId} not found`)
      return {
        status: job.status,
        accuracy: job.accuracy,
        deployed: !!job.deployed,
        error: job.error,
        phase: jobPhases.get(payload.jobId) ?? null
      }
    }
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_TRAIN_HISTORY,
    (_event, projectPath: string) => speechDB.getTrainingJobs(projectPath)
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_CREATE_SESSION,
    (_event, payload: { projectPath: string; projectId?: string }) =>
      speechDB.createSession(payload.projectPath, payload.projectId ?? null)
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_END_SESSION,
    (_event, payload: { sessionId: number; projectPath: string }) =>
      speechDB.endSession(payload.projectPath, payload.sessionId)
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_GET_UTTERANCES,
    (_event, payload: { sessionId: number; projectPath: string }) =>
      speechDB.getUtterances(payload.projectPath, payload.sessionId)
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_GET_SESSIONS,
    (_event, projectPath: string) => speechDB.getSessions(projectPath)
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_START_STREAM,
    (_event, payload: { sessionId: number; projectPath: string }) => {
      startSession(payload.sessionId, payload.projectPath)
    }
  )

  ipcMain.on(
    IPC.ACTIVE_LISTENING_AUDIO_CHUNK,
    (_event, payload: { sessionId: number; audioBuffer: ArrayBuffer; projectPath: string }) => {
      processChunk(payload.sessionId, payload.audioBuffer, payload.projectPath).catch(
        (e) => console.error('[Speech] chunk error:', e)
      )
    }
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_STOP_STREAM,
    (_event, payload: { sessionId: number }) => {
      stopSession(payload.sessionId)
    }
  )
}
