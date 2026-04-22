import { useRef, useState } from 'react'
import { useChatStore } from '../../stores/useChatStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useServiceStore } from '../../stores/useServiceStore'
import clsx from 'clsx'
import styles from './ChatInput.module.css'

type MicState = 'idle' | 'recording' | 'transcribing'

export function ChatInput(): JSX.Element {
  const inputValue = useChatStore((s) => s.inputValue)
  const setInputValue = useChatStore((s) => s.setInputValue)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const isLoading = useChatStore((s) => s.isLoading)
  const micDeviceId = useSettingsStore((s) => s.micDeviceId)
  const roseSpeechOnline = useServiceStore((s) => s.roseSpeech)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [micState, setMicState] = useState<MicState>('idle')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

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
      } catch {
        // mic permission denied or unavailable
      }
    } else if (micState === 'recording') {
      mediaRecorderRef.current?.stop()
    }
  }

  return (
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
        <button
          className={clsx(styles.micBtn, {
            [styles.micRecording]: micState === 'recording',
            [styles.micTranscribing]: micState === 'transcribing',
            [styles.micOffline]: roseSpeechOnline === false
          })}
          onClick={handleMicClick}
          disabled={isLoading || micState === 'transcribing' || roseSpeechOnline === false}
          title={
            roseSpeechOnline === false
              ? 'RoseSpeech is offline — speech input unavailable'
              : micState === 'recording' ? 'Stop recording' : 'Record voice message'
          }
        >
          {micState === 'transcribing' ? '…' : '🎙'}
        </button>
        <button
          className={styles.sendBtn}
          onClick={sendMessage}
          disabled={isLoading || !inputValue.trim()}
        >
          {isLoading ? 'Thinking...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
