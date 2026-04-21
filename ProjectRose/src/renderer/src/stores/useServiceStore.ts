import { create } from 'zustand'

interface ServiceStore {
  roseLibrary: boolean | null
  roseSpeech: boolean | null
  setStatus: (roseLibrary: boolean, roseSpeech: boolean) => void
}

export const useServiceStore = create<ServiceStore>((set) => ({
  roseLibrary: null,
  roseSpeech: null,
  setStatus: (roseLibrary, roseSpeech) => set({ roseLibrary, roseSpeech })
}))
