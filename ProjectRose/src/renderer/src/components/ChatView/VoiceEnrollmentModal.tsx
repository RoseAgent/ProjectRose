import { useState, useRef, useEffect } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useActiveListeningStore } from '../../stores/useActiveListeningStore'
import styles from './VoiceEnrollmentModal.module.css'

const PASSAGE =
  'The quick brown fox jumps over the lazy dog. ' +
  'Good morning — I enjoy working with my AI assistant every day. ' +
  'The weather today is quite pleasant for outdoor activities.'

const RECORD_SECONDS = 30

export function VoiceEnrollmentModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [phase, setPhase] = useState<'record' | 'training' | 'error'>('record')
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [trainMessage, setTrainMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const micDeviceId = useSettingsStore((s) => s.micDeviceId)
  const userName = useSettingsStore((s) => s.userName)
  const rootPath = useProjectStore((s) => s.rootPath)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasBlobRef = useRef(false)

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const startRecording = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true
      })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      hasBlobRef.current = false

      recorder.ondataavailable = (e): void => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = (): void => {
        hasBlobRef.current = true
      }

      recorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
      setElapsed(0)

      let count = 0
      tickRef.current = setInterval(() => {
        count++
        setElapsed(count)
        if (count >= RECORD_SECONDS) {
          stopRecording()
        }
      }, 1000)
    } catch {
      // mic unavailable
    }
  }

  const stopRecording = (): void => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setIsRecording(false)
  }

  const waitForBlob = (): Promise<void> =>
    new Promise((resolve) => {
      const check = (): void => {
        if (hasBlobRef.current) { resolve(); return }
        setTimeout(check, 50)
      }
      check()
    })

  const handleTrainActivate = async (): Promise<void> => {
    if (!rootPath) return
    if (isRecording) stopRecording()
    await waitForBlob()

    setPhase('training')
    setTrainMessage('Saving voice sample…')

    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const audioBuffer = await blob.arrayBuffer()

      const { id: speakerId } = await window.api.activeSpeech.createSpeaker({
        name: userName || 'User',
        projectPath: rootPath
      })

      await window.api.activeSpeech.addSample({
        speakerId,
        source: 'wizard',
        audioBuffer,
        projectPath: rootPath
      })

      setTrainMessage('Training voice model…')
      const { job_id } = await window.api.activeSpeech.train(rootPath)

      await new Promise<void>((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const status = await window.api.activeSpeech.trainStatus({ jobId: job_id, projectPath: rootPath })
            if (status.accuracy !== null) {
              setTrainMessage(`Training… ${Math.round(status.accuracy * 100)}% accuracy`)
            }
            if (status.status === 'done') {
              clearInterval(poll)
              resolve()
            } else if (status.status === 'failed') {
              clearInterval(poll)
              reject(new Error(status.error ?? 'Training failed'))
            }
          } catch (e) {
            clearInterval(poll)
            reject(e)
          }
        }, 2000)
      })

      await useSettingsStore.getState().update({
        roseSpeechSpeakerId: speakerId,
        activeListeningSetupComplete: true
      })

      useActiveListeningStore.getState().setActive(true)
      onClose()
    } catch (err) {
      setPhase('error')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const handleSkip = async (): Promise<void> => {
    if (isRecording) stopRecording()
    await useSettingsStore.getState().update({ activeListeningSetupComplete: true })
    useActiveListeningStore.getState().setActive(true)
    onClose()
  }

  const progress = Math.min((elapsed / RECORD_SECONDS) * 100, 100)

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={onClose} title="Close">✕</button>

        <div className={styles.label}>VOICE ENROLLMENT</div>
        <div className={styles.name}>SPECIMEN · {userName || 'User'}</div>

        {phase === 'record' && (
          <>
            <div className={styles.instruction}>
              Read aloud to register your voice:
            </div>
            <div className={styles.passage}>{PASSAGE}</div>

            {isRecording ? (
              <>
                <div className={styles.recordingStatus}>
                  <span className={styles.recDot} /> Recording  {elapsed}s / {RECORD_SECONDS}s
                </div>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>
                <div className={styles.btnRow}>
                  <button className={styles.btnSecondary} onClick={stopRecording}>Stop Early</button>
                  <button className={styles.btnPrimary} onClick={handleTrainActivate}>
                    Done → Train &amp; Activate
                  </button>
                </div>
              </>
            ) : elapsed > 0 ? (
              <>
                <div className={styles.recordingStatus}>Recording complete — {elapsed}s captured</div>
                <div className={styles.btnRow}>
                  <button className={styles.btnSecondary} onClick={handleSkip}>Skip for now</button>
                  <button className={styles.btnPrimary} onClick={handleTrainActivate}>
                    Train &amp; Activate
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.btnRow}>
                  <button className={styles.btnSecondary} onClick={handleSkip}>Skip for now</button>
                  <button className={styles.btnPrimary} onClick={startRecording}>
                    ● Start Recording
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {phase === 'training' && (
          <div className={styles.trainingWrap}>
            <div className={styles.spinner} />
            <div className={styles.trainMsg}>{trainMessage}</div>
          </div>
        )}

        {phase === 'error' && (
          <div className={styles.trainingWrap}>
            <div className={styles.errorMsg}>{errorMessage}</div>
            <div className={styles.btnRow}>
              <button className={styles.btnSecondary} onClick={handleSkip}>Skip enrollment</button>
              <button className={styles.btnPrimary} onClick={() => setPhase('record')}>Try again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
