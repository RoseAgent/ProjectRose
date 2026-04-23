import { BrowserWindow } from 'electron'
import { IPC } from '../../../shared/ipcChannels'
import { webmToWav, cleanupWav, saveRecording } from './audioService'
import { transcribe } from './whisperService'
import { embed, identify } from './speakerService'
import * as db from './speechDB'

interface ActiveSession {
  sessionId: number
  projectPath: string
}

const activeSessions = new Map<number, ActiveSession>()

export function startSession(sessionId: number, projectPath: string): void {
  activeSessions.set(sessionId, { sessionId, projectPath })
}

export function stopSession(sessionId: number): void {
  activeSessions.delete(sessionId)
}

export async function processChunk(
  sessionId: number,
  audioBuffer: ArrayBuffer,
  projectPath: string
): Promise<void> {
  let wavPath: string | null = null

  try {
    wavPath = await webmToWav(audioBuffer)
    const text = await transcribe(wavPath)

    if (!text) return

    const embedding = await embed(wavPath)
    const { speakerId, confidence } = embedding
      ? identify(embedding, projectPath)
      : { speakerId: null, confidence: 0 }

    // Look up speaker name if identified
    let speakerName: string | null = null
    if (speakerId !== null) {
      const speakers = db.getSpeakers(projectPath) as Array<{ id: number; name: string }>
      speakerName = speakers.find((s) => s.id === speakerId)?.name ?? null
    }

    // Save raw webm recording to disk
    const audioPath = saveRecording(projectPath, speakerId, audioBuffer)

    // Save to DB
    const recording = db.addRecording(projectPath, speakerId, audioPath, 'active_listening', projectPath, null)
    const utterance = db.createUtterance(projectPath, sessionId, recording.id, speakerId, text)

    console.log(`[Speech] utterance ${utterance.id}: "${text}" (speaker: ${speakerName ?? 'unknown'}, conf: ${confidence.toFixed(2)})`)

    // Push utterance event to renderer
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send(IPC.ACTIVE_LISTENING_UTTERANCE, {
      type: 'utterance',
      sessionId,
      utterance_id: utterance.id,
      speaker_name: speakerName,
      text
    })
  } catch (e) {
    console.error('[Speech] processChunk error:', e)
  } finally {
    if (wavPath) cleanupWav(wavPath)
  }
}
