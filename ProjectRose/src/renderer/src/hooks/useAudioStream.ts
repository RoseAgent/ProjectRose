import { useEffect } from 'react'
import { useSettingsStore } from '../stores/useSettingsStore'

const CHUNK_MS = 2500

export function useAudioStream({ enabled, sessionId, projectPath }: {
  enabled: boolean
  sessionId: number | null
  projectPath: string | null
}): void {
  const micDeviceId = useSettingsStore((s) => s.micDeviceId)

  useEffect(() => {
    if (!enabled || sessionId === null || !projectPath) return

    let stream: MediaStream | null = null
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null

    // Start a fresh MediaRecorder for each chunk so every blob is a complete
    // webm file with its own header. Using timeslice produces continuation
    // frames that ffmpeg cannot decode independently.
    function recordChunk(s: MediaStream): void {
      if (!active) return
      const recorder = new MediaRecorder(s)
      const pieces: Blob[] = []

      recorder.ondataavailable = (e): void => {
        if (e.data.size > 0) pieces.push(e.data)
      }

      recorder.onstop = async (): Promise<void> => {
        if (pieces.length > 0) {
          const blob = new Blob(pieces, { type: recorder.mimeType || 'audio/webm' })
          try {
            const buf = await blob.arrayBuffer()
            window.api.activeSpeech.sendAudioChunk({
              sessionId: sessionId!,
              audioBuffer: buf,
              projectPath: projectPath!
            })
          } catch { /* fire-and-forget */ }
        }
        if (active) recordChunk(s)
      }

      recorder.start()
      timer = setTimeout(() => {
        try { recorder.stop() } catch { /* ignore */ }
      }, CHUNK_MS)
    }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true
        })
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return }
        recordChunk(stream)
      } catch {
        // mic unavailable or permission denied
      }
    })()

    return () => {
      active = false
      if (timer) clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled, sessionId, projectPath, micDeviceId])
}
