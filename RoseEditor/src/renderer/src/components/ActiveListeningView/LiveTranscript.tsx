import { useEffect, useRef, useState } from 'react'
import { LabelSpeakerDialog } from './LabelSpeakerDialog'
import styles from './ActiveListeningView.module.css'

interface Utterance {
  id: number
  speakerName: string | null
  text: string
}

interface Props {
  sessionId: number
}

// How long each recording segment is before being sent for transcription.
const SEGMENT_MS = 5000

export function LiveTranscript({ sessionId }: Props): JSX.Element {
  const [utterances, setUtterances] = useState<Utterance[]>([])
  const [labelTarget, setLabelTarget] = useState<number | null>(null)
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Each effect run gets its own `active` object. Cleanup sets active.value = false,
    // which stops any in-flight async work from this run from doing anything.
    const active = { value: true }

    const start = async (): Promise<void> => {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        return
      }
      if (!active.value) { stream.getTracks().forEach((t) => t.stop()); return }

      const ws = new WebSocket(`ws://127.0.0.1:8040/ws/live?session_id=${sessionId}`)

      if (!active.value) { ws.close(); return }

      ws.onopen = (): void => {
        if (!active.value) { ws.close(); return }
        setConnected(true)
        runRecordLoop(stream, ws, active)
      }

      ws.onmessage = (event): void => {
        if (!active.value) return
        try {
          const msg = JSON.parse(event.data as string)
          if (msg.type === 'utterance') {
            setUtterances((prev) => [
              ...prev,
              { id: msg.utterance_id, speakerName: msg.speaker_name ?? null, text: msg.text }
            ])
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onclose = (): void => { if (active.value) setConnected(false) }
      ws.onerror = (): void => { if (active.value) setConnected(false) }

      // Store refs for cleanup
      ;(active as { value: boolean; stream?: MediaStream; ws?: WebSocket }).stream = stream
      ;(active as { value: boolean; stream?: MediaStream; ws?: WebSocket }).ws = ws
    }

    start()

    return (): void => {
      active.value = false
      const a = active as { value: boolean; stream?: MediaStream; ws?: WebSocket }
      a.stream?.getTracks().forEach((t) => t.stop())
      a.ws?.close()
    }
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [utterances])

  const handleLabel = (utteranceId: number, speakerName: string): void => {
    setUtterances((prev) =>
      prev.map((u) => (u.id === utteranceId ? { ...u, speakerName } : u))
    )
    setLabelTarget(null)
  }

  return (
    <div className={styles.transcriptContainer}>
      <div className={styles.statusRow}>
        <span className={connected ? styles.statusConnected : styles.statusDisconnected}>
          {connected ? '● Listening' : '○ Disconnected'}
        </span>
      </div>

      <div className={styles.transcript}>
        {utterances.map((u) => (
          <div key={u.id} className={styles.utterance}>
            <span className={styles.speakerName}>
              {u.speakerName ? (
                u.speakerName
              ) : (
                <button className={styles.unknownBtn} onClick={() => setLabelTarget(u.id)}>
                  Unknown
                </button>
              )}
              {':'}
            </span>
            <span className={styles.utteranceText}>{u.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {labelTarget !== null && (
        <LabelSpeakerDialog
          utteranceId={labelTarget}
          onLabel={handleLabel}
          onCancel={() => setLabelTarget(null)}
        />
      )}
    </div>
  )
}

// Runs outside the component so it never closes over stale state.
// Records one SEGMENT_MS clip, sends it, then immediately records the next.
async function runRecordLoop(
  stream: MediaStream,
  ws: WebSocket,
  active: { value: boolean }
): Promise<void> {
  while (active.value && ws.readyState === WebSocket.OPEN) {
    const blob = await recordSegment(stream, SEGMENT_MS, active)
    if (!active.value || ws.readyState !== WebSocket.OPEN) break
    if (blob) {
      try {
        ws.send(await blob.arrayBuffer())
      } catch {
        break
      }
    }
  }
}

function recordSegment(
  stream: MediaStream,
  durationMs: number,
  active: { value: boolean }
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!active.value) { resolve(null); return }

    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })

    recorder.ondataavailable = (e): void => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    recorder.onstop = (): void => {
      resolve(chunks.length > 0 ? new Blob(chunks, { type: 'audio/webm' }) : null)
    }

    recorder.start()
    setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, durationMs)
  })
}
