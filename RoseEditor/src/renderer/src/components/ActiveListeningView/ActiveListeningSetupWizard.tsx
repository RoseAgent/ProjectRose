import { useState, useRef } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import styles from './ActiveListeningView.module.css'

const PROMPTS = [
  "Say: 'Hello, my name is [your name] and I'm setting up voice recognition.'",
  "Say: 'The quick brown fox jumps over the lazy dog.'",
  "Say: 'Today I want to work on something interesting and challenging.'",
  "Say: 'Voice recognition helps me communicate more naturally with my AI assistant.'",
  "Say: 'This is my final recording for the voice setup wizard. Thank you.'"
]

interface Props {
  onComplete: () => void
}

export function ActiveListeningSetupWizard({ onComplete }: Props): JSX.Element {
  const [step, setStep] = useState(0)
  const [recorded, setRecorded] = useState<boolean[]>(new Array(PROMPTS.length).fill(false))
  const [micState, setMicState] = useState<'idle' | 'recording'>('idle')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const userName = useSettingsStore((s) => s.userName)
  const update = useSettingsStore((s) => s.update)
  const micDeviceId = useSettingsStore((s) => s.micDeviceId)

  const startRecording = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true
      })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e): void => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setMicState('recording')
    } catch {
      setError('Microphone access denied or unavailable.')
    }
  }

  const stopAndUpload = async (): Promise<void> => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return

    return new Promise((resolve) => {
      recorder.onstop = async (): Promise<void> => {
        recorder.stream.getTracks().forEach((t) => t.stop())
        setMicState('idle')
        setUploading(true)
        setError('')

        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          const arrayBuffer = await blob.arrayBuffer()

          let speakerId = useSettingsStore.getState().roseSpeechSpeakerId
          if (!speakerId) {
            const speaker = await window.api.activeSpeech.createSpeaker(userName || 'User')
            speakerId = speaker.id
            await update({ roseSpeechSpeakerId: speakerId })
          }

          await window.api.activeSpeech.addSample({
            speakerId: speakerId!,
            source: 'wizard',
            audioBuffer: arrayBuffer
          })

          const next = [...recorded]
          next[step] = true
          setRecorded(next)

          if (step < PROMPTS.length - 1) {
            setStep(step + 1)
          } else {
            await update({ activeListeningSetupComplete: true })
            onComplete()
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Upload failed.')
        } finally {
          setUploading(false)
          resolve()
        }
      }
      recorder.stop()
    })
  }

  const handleMic = (): void => {
    if (micState === 'idle') {
      startRecording()
    } else {
      stopAndUpload()
    }
  }

  return (
    <div className={styles.setupOverlay}>
      <div className={styles.setupDialog}>
        <h2 className={styles.setupTitle}>Voice Setup</h2>
        <p className={styles.setupSubtitle}>
          Record {PROMPTS.length} voice samples so the app can recognize your voice.
          Step {step + 1} of {PROMPTS.length}
        </p>

        <div className={styles.progressRow}>
          {PROMPTS.map((_, i) => (
            <div
              key={i}
              className={`${styles.progressDot} ${recorded[i] ? styles.progressDotDone : ''} ${i === step ? styles.progressDotActive : ''}`}
            />
          ))}
        </div>

        <div className={styles.prompt}>{PROMPTS[step]}</div>

        {error && <div className={styles.error}>{error}</div>}

        <button
          className={`${styles.micBtn} ${micState === 'recording' ? styles.micBtnRecording : ''}`}
          onClick={handleMic}
          disabled={uploading}
        >
          {uploading ? 'Saving...' : micState === 'recording' ? 'Stop Recording' : 'Start Recording'}
        </button>

        {micState === 'recording' && (
          <div className={styles.recordingIndicator}>Recording...</div>
        )}
      </div>
    </div>
  )
}
