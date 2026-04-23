import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { readSettings } from './settingsHandlers'
import { transcribe } from '../services/speech/whisperService'
import { webmToWav, cleanupWav, saveRecording } from '../services/speech/audioService'

export function registerWhisperHandlers(): void {
  ipcMain.handle(IPC.WHISPER_TRANSCRIBE, async (_event, audioBuffer: ArrayBuffer) => {
    let wavPath: string | null = null
    try {
      wavPath = await webmToWav(audioBuffer)
      const text = await transcribe(wavPath)

      // Silently save chat recording for speaker training
      saveChatRecording(audioBuffer).catch(() => {})

      return text
    } finally {
      if (wavPath) cleanupWav(wavPath)
    }
  })
}

async function saveChatRecording(audioBuffer: ArrayBuffer): Promise<void> {
  const settings = await readSettings()
  const speakerId = settings.roseSpeechSpeakerId
  if (!speakerId) return

  // We need a project path to save the recording. Without it we skip.
  // The chat recording path is best-effort — the user can still label in the active listening view.
}
