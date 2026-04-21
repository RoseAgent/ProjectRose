import { ipcMain } from 'electron'
import { Blob } from 'node:buffer'
import { IPC } from '../../shared/ipcChannels'

const BASE = 'http://127.0.0.1:8040'

export function registerActiveSpeechHandlers(): void {
  ipcMain.handle(IPC.ACTIVE_LISTENING_GET_SPEAKERS, async () => {
    const res = await fetch(`${BASE}/speakers`)
    if (!res.ok) throw new Error(`Failed to fetch speakers: ${res.status}`)
    return res.json()
  })

  ipcMain.handle(IPC.ACTIVE_LISTENING_CREATE_SPEAKER, async (_event, name: string) => {
    const res = await fetch(`${BASE}/speakers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    if (!res.ok) throw new Error(`Failed to create speaker: ${res.status}`)
    return res.json()
  })

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_ADD_SAMPLE,
    async (_event, payload: { speakerId: number; source: string; audioBuffer: ArrayBuffer; projectId?: string }) => {
      const { speakerId, source, audioBuffer, projectId } = payload
      const blob = new Blob([audioBuffer], { type: 'audio/webm' })
      const form = new FormData()
      form.append('file', blob, 'recording.webm')
      form.append('source', source)
      if (projectId) form.append('project_id', projectId)

      const res = await fetch(`${BASE}/speakers/${speakerId}/samples`, {
        method: 'POST',
        body: form
      })
      if (!res.ok) throw new Error(`Failed to add sample: ${res.status}`)
      return res.json()
    }
  )

  ipcMain.handle(
    IPC.ACTIVE_LISTENING_LABEL_SPEAKER,
    async (_event, payload: { utteranceId: number; speakerId?: number; speakerName?: string }) => {
      const { utteranceId, speakerId, speakerName } = payload
      const res = await fetch(`${BASE}/sessions/utterances/${utteranceId}/speaker`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker_id: speakerId ?? null, speaker_name: speakerName ?? null })
      })
      if (!res.ok) throw new Error(`Failed to label speaker: ${res.status}`)
      return res.json()
    }
  )

  ipcMain.handle(IPC.ACTIVE_LISTENING_TRAIN, async () => {
    const res = await fetch(`${BASE}/train`, { method: 'POST' })
    if (!res.ok) throw new Error(`Failed to start training: ${res.status}`)
    return res.json()
  })

  ipcMain.handle(IPC.ACTIVE_LISTENING_TRAIN_STATUS, async (_event, jobId: number) => {
    const res = await fetch(`${BASE}/train/status/${jobId}`)
    if (!res.ok) throw new Error(`Failed to get training status: ${res.status}`)
    return res.json()
  })

  ipcMain.handle(IPC.ACTIVE_LISTENING_TRAIN_HISTORY, async () => {
    const res = await fetch(`${BASE}/train/history`)
    if (!res.ok) throw new Error(`Failed to get training history: ${res.status}`)
    return res.json()
  })

  ipcMain.handle(IPC.ACTIVE_LISTENING_CREATE_SESSION, async (_event, projectId?: string) => {
    const res = await fetch(`${BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId ?? null })
    })
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`)
    return res.json()
  })

  ipcMain.handle(IPC.ACTIVE_LISTENING_END_SESSION, async (_event, sessionId: number) => {
    const res = await fetch(`${BASE}/sessions/${sessionId}/end`, { method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    if (!res.ok) throw new Error(`Failed to end session: ${res.status}`)
    return res.json()
  })

  ipcMain.handle(IPC.ACTIVE_LISTENING_GET_UTTERANCES, async (_event, sessionId: number) => {
    const res = await fetch(`${BASE}/sessions/${sessionId}/utterances`)
    if (!res.ok) throw new Error(`Failed to get utterances: ${res.status}`)
    return res.json()
  })

  ipcMain.handle(IPC.ACTIVE_LISTENING_GET_SESSIONS, async () => {
    const res = await fetch(`${BASE}/sessions`)
    if (!res.ok) throw new Error(`Failed to get sessions: ${res.status}`)
    return res.json()
  })
}
