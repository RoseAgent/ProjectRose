import { useRef, useState } from 'react'
import { useChat } from '../../stores/useChat'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useActiveListeningStore } from '../../stores/useActiveListeningStore'
import { useScreenWebcamShare } from '../../hooks/useScreenWebcamShare'
import { SharePreview } from './SharePreview'
import { ScreenSourcePickerModal } from './ScreenSourcePickerModal'
import clsx from 'clsx'
import styles from './ChatInput.module.css'

type MicState = 'idle' | 'recording' | 'transcribing'

export function ChatInput(): JSX.Element {
  const inputValue = useChat((s) => s.inputValue)
  const setInputValue = useChat((s) => s.setInputValue)
  const isLoading = useChat((s) => s.isLoading)
  const sendMessage = useChat((s) => s.send)
  const cancelGeneration = useChat((s) => s.cancel)
  // On an external session with a CLI choice selected, Send works with an
  // empty input: it resumes the session interactively in the terminal.
  const cliResume = useChat(
    (s) => s.externalView !== null && s.composerChoice?.kind === 'cli'
  )
  const micDeviceId = useSettingsStore((s) => s.micDeviceId)
  const isDrafting = useActiveListeningStore((s) => s.isDrafting)
  const draftSecondsLeft = useActiveListeningStore((s) => s.draftSecondsLeft)
  const shareMode = useScreenWebcamShare((s) => s.mode)
  const startScreen = useScreenWebcamShare((s) => s.startScreen)
  const startWebcam = useScreenWebcamShare((s) => s.startWebcam)
  const stopShare = useScreenWebcamShare((s) => s.stop)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [micState, setMicState] = useState<MicState>('idle')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const handleScreenClick = (): void => {
    if (shareMode === 'screen') stopShare()
    else void startScreen()
  }
  const handleWebcamClick = (): void => {
    if (shareMode === 'webcam') stopShare()
    else void startWebcam()
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleMicClick = async (): Promise<void> => {
    if (micState === 'idle') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true
        })
        const recorder = new MediaRecorder(stream)
        chunksRef.current = []

        recorder.ondataavailable = (e): void => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }

        recorder.onstop = async (): Promise<void> => {
          stream.getTracks().forEach((t) => t.stop())
          useChat.getState().setIsRecording(false)
          setMicState('transcribing')
          try {
            const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
            const arrayBuffer = await blob.arrayBuffer()
            const text = await window.api.transcribeAudio(arrayBuffer)
            if (text) {
              setInputValue(inputValue ? `${inputValue} ${text}` : text)
            }
          } catch {
            // transcription failed silently
          } finally {
            setMicState('idle')
            textareaRef.current?.focus()
          }
        }

        mediaRecorderRef.current = recorder
        recorder.start()
        setMicState('recording')
        useChat.getState().setIsRecording(true)
      } catch {
        // mic permission denied or unavailable
      }
    } else if (micState === 'recording') {
      mediaRecorderRef.current?.stop()
    }
  }

  return (
    <div className={styles.inputWrap}>
      {isDrafting && (
        <div className={styles.draftBanner}>
          <span className={styles.draftDot} />
          <span className={styles.draftLabel}>
            Drafting · auto-send in <strong>{draftSecondsLeft ?? 0}s</strong>
          </span>
          <button
            className={styles.draftCancel}
            onClick={() => {
              const sid = useActiveListeningStore.getState().sessionId
              if (sid !== null) window.api.activeSpeech.cancelDraft({ sessionId: sid })
              useActiveListeningStore.getState().clearDraft()
            }}
          >
            ✕ Cancel
          </button>
        </div>
      )}
      <SharePreview />
      <div className={styles.inputArea}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          disabled={isLoading}
          rows={2}
        />
        <div className={styles.btnStack}>
          <div className={styles.iconRow}>
            {isLoading && (
              <button
                className={styles.cancelBtn}
                onClick={() => cancelGeneration()}
                title="Cancel generation"
              >
                ✕
              </button>
            )}
            <button
              className={clsx(styles.shareBtn, {
                [styles.shareActive]: shareMode === 'screen'
              })}
              onClick={handleScreenClick}
              disabled={isLoading}
              title={shareMode === 'screen' ? 'Stop sharing screen' : 'Share screen or window'}
            >
              🖥
            </button>
            <button
              className={clsx(styles.shareBtn, {
                [styles.shareActive]: shareMode === 'webcam'
              })}
              onClick={handleWebcamClick}
              disabled={isLoading}
              title={shareMode === 'webcam' ? 'Stop camera' : 'Share camera'}
            >
              📷
            </button>
            <button
              className={clsx(styles.micBtn, {
                [styles.micRecording]: micState === 'recording',
                [styles.micTranscribing]: micState === 'transcribing'
              })}
              onClick={handleMicClick}
              disabled={isLoading || micState === 'transcribing'}
              title={micState === 'recording' ? 'Stop recording' : 'Record voice message'}
            >
              {micState === 'transcribing' ? '…' : '🎙'}
            </button>
          </div>
          <button
            className={styles.sendBtn}
            onClick={sendMessage}
            disabled={isLoading || (!inputValue.trim() && !cliResume)}
          >
            {isLoading ? 'Thinking...' : cliResume && !inputValue.trim() ? 'Resume' : 'Send'}
          </button>
        </div>
      </div>
      <ScreenSourcePickerModal />
    </div>
  )
}
