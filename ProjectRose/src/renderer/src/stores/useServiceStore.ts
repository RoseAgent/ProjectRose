import { create } from 'zustand'

interface ServiceStore {
  roseSpeech: boolean | null
  setStatus: (roseSpeech: boolean) => void
}

export const useServiceStore = create<ServiceStore>((set) => ({
  roseSpeech: null,
  setStatus: (roseSpeech) => set({ roseSpeech })
}))
