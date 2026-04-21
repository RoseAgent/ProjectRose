import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'herbarium'

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark' as Theme,
      toggleTheme: () =>
        set((state) => ({ theme: state.theme === 'dark' ? 'herbarium' : 'dark' }))
    }),
    {
      name: 'rose-editor-theme',
      onRehydrateStorage: () => (state) => {
        if (state && (state.theme as string) === 'light') {
          state.theme = 'herbarium'
        }
      }
    }
  )
)
