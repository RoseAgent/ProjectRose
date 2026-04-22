import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import { readSettings } from './settingsHandlers'

export function registerWhisperHandlers(): void {
  ipcMain.handle(IPC.WHISPER_TRANSCRIBE, async (_event, audioBuffer: ArrayBuffer) => {
    const blob = new Blob([audioBuffer], { type: 'audio/webm' })
    const form = new FormData()
    form.append('file', blob, 'recording.webm')

    const res = await fetch('http://127.0.0.1:8040/transcribe', {
      method: 'POST',
      body: form
    })
    if (!res.ok) throw new Error(`Transcription failed: ${res.status}`)
    const { text } = await res.json() as { text: string }

    // Silently save chat recording for speaker training
    saveChatRecording(audioBuffer).catch(() => {})

    return text
  })
}

async function saveChatRecording(audioBuffer: ArrayBuffer): Promise<void> {
  const settings = await readSettings()
  const speakerId = settings.roseSpeechSpeakerId
  if (!speakerId) return

  const blob = new Blob([audioBuffer], { type: 'audio/webm' })
  const form = new FormData()
  form.append('file', blob, 'recording.webm')
  form.append('source', 'chat')

  await fetch(`http://127.0.0.1:8040/speakers/${speakerId}/samples`, {
    method: 'POST',
    body: form
  })
}
