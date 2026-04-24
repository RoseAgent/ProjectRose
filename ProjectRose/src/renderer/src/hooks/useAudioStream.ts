import { useEffect } from 'react'
import { useSettingsStore } from '../stores/useSettingsStore'

export function useAudioStream({ enabled, sessionId, projectPath }: {
  enabled: boolean
  sessionId: number | null
  projectPath: string | null
}): void {
  const micDeviceId = useSettingsStore((s) => s.micDeviceId)

  useEffect(() => {
    if (!enabled || sessionId === null || !projectPath) return

    let recorder: MediaRecorder | null = null
    let stream: MediaStream | null = null
    let active = true

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true
        })
        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        recorder = new MediaRecorder(stream)
        recorder.ondataavailable = async (e): Promise<void> => {
          if (!active || e.data.size === 0) return
          try {
            const buf = await e.data.arrayBuffer()
            window.api.activeSpeech.sendAudioChunk({ sessionId: sessionId!, audioBuffer: buf, projectPath: projectPath! })
          } catch {
            // fire-and-forget
          }
        }
        recorder.start(2500)
      } catch {
        // mic permission denied or unavailable
      }
    })()

    return () => {
      active = false
      try { recorder?.stop() } catch { /* ignore if already stopped */ }
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled, sessionId, projectPath, micDeviceId])
}
