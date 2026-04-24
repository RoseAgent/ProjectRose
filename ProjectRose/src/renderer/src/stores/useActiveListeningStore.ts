import { create } from 'zustand'

export interface Utterance {
  utteranceId: number
  speakerName: string | null
  text: string
  timestamp: number
}

export interface Speaker {
  id: number
  name: string
}

interface ActiveListeningState {
  isActive: boolean
  sessionId: number | null
  mode: 'chat' | 'transcript'
  utterances: Utterance[]
  speakers: Speaker[]
  isDrafting: boolean
  draftText: string
  draftSecondsLeft: number | null

  setActive: (v: boolean) => void
  setSessionId: (id: number | null) => void
  setMode: (m: 'chat' | 'transcript') => void
  addUtterance: (u: Utterance) => void
  updateUtteranceSpeaker: (utteranceId: number, speakerName: string) => void
  setSpeakers: (s: Speaker[]) => void
  addSpeaker: (s: Speaker) => void
  startDraft: (text: string) => void
  appendDraft: (text: string) => void
  cancelDraft: () => void
  completeDraft: () => void
  setDraftSecondsLeft: (n: number | null) => void
  reset: () => void
}

export const useActiveListeningStore = create<ActiveListeningState>()((set) => ({
  isActive: false,
  sessionId: null,
  mode: 'chat',
  utterances: [],
  speakers: [],
  isDrafting: false,
  draftText: '',
  draftSecondsLeft: null,

  setActive: (v) => set({ isActive: v }),
  setSessionId: (id) => set({ sessionId: id }),
  setMode: (m) => set({ mode: m }),
  addUtterance: (u) => set((s) => ({ utterances: [...s.utterances, u] })),
  updateUtteranceSpeaker: (utteranceId, speakerName) =>
    set((s) => ({
      utterances: s.utterances.map((u) =>
        u.utteranceId === utteranceId ? { ...u, speakerName } : u
      )
    })),
  setSpeakers: (sp) => set({ speakers: sp }),
  addSpeaker: (sp) => set((s) => ({ speakers: [...s.speakers, sp] })),
  startDraft: (text) => set({ isDrafting: true, draftText: text }),
  appendDraft: (text) => set((s) => ({ draftText: s.draftText + ' ' + text })),
  cancelDraft: () => set({ isDrafting: false, draftText: '', draftSecondsLeft: null }),
  completeDraft: () => set({ isDrafting: false, draftText: '', draftSecondsLeft: null }),
  setDraftSecondsLeft: (n) => set({ draftSecondsLeft: n }),
  reset: () => set({ utterances: [], speakers: [], isDrafting: false, draftText: '', draftSecondsLeft: null, sessionId: null }),
}))
