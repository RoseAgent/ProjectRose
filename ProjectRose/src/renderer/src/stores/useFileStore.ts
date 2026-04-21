import { create } from 'zustand'
import { useProjectStore } from './useProjectStore'

const extensionToLanguage: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.md': 'markdown',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.ps1': 'powershell',
  '.bat': 'bat',
  '.cmd': 'bat',
  '.dockerfile': 'dockerfile',
  '.lua': 'lua',
  '.r': 'r',
  '.dart': 'dart'
}

// Simple path utilities that work in renderer (no Node 'path' in renderer)
function getBasename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

function getExtname(filePath: string): string {
  const name = getBasename(filePath)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot) : ''
}

function detectLanguageRenderer(filePath: string): string {
  const ext = getExtname(filePath).toLowerCase()
  const name = getBasename(filePath).toLowerCase()
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  return extensionToLanguage[ext] || 'plaintext'
}

export interface OpenFile {
  filePath: string
  fileName: string
  content: string
  savedContent: string
  language: string
}

interface FileState {
  openFiles: OpenFile[]
  activeFilePath: string | null
  getActiveFile: () => OpenFile | null
  isDirty: (filePath: string) => boolean
  openFile: (filePath: string) => Promise<void>
  closeFile: (filePath: string) => void
  setActiveFile: (filePath: string) => void
  updateContent: (filePath: string, content: string) => void
  saveFile: (filePath: string) => Promise<void>
  saveActiveFile: () => Promise<void>
  createNewFile: () => void
}

let untitledCounter = 0

export const useFileStore = create<FileState>()((set, get) => ({
  openFiles: [],
  activeFilePath: null,

  getActiveFile: () => {
    const { openFiles, activeFilePath } = get()
    return openFiles.find((f) => f.filePath === activeFilePath) || null
  },

  isDirty: (filePath: string) => {
    const file = get().openFiles.find((f) => f.filePath === filePath)
    return file ? file.content !== file.savedContent : false
  },

  openFile: async (filePath: string) => {
    const { openFiles } = get()
    const existing = openFiles.find((f) => f.filePath === filePath)
    if (existing) {
      set({ activeFilePath: filePath })
      return
    }

    const content = await window.api.readFile(filePath)
    const fileName = getBasename(filePath)
    const language = detectLanguageRenderer(filePath)

    set((state) => ({
      openFiles: [
        ...state.openFiles,
        { filePath, fileName, content, savedContent: content, language }
      ],
      activeFilePath: filePath
    }))
  },

  closeFile: (filePath: string) => {
    set((state) => {
      const idx = state.openFiles.findIndex((f) => f.filePath === filePath)
      if (idx === -1) return state

      const next = state.openFiles.filter((f) => f.filePath !== filePath)
      let nextActive = state.activeFilePath

      if (state.activeFilePath === filePath) {
        if (next.length === 0) {
          nextActive = null
        } else if (idx >= next.length) {
          nextActive = next[next.length - 1].filePath
        } else {
          nextActive = next[idx].filePath
        }
      }

      return { openFiles: next, activeFilePath: nextActive }
    })
  },

  setActiveFile: (filePath: string) => {
    set({ activeFilePath: filePath })
  },

  updateContent: (filePath: string, content: string) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.filePath === filePath ? { ...f, content } : f
      )
    }))
  },

  saveFile: async (filePath: string) => {
    const file = get().openFiles.find((f) => f.filePath === filePath)
    if (!file) return

    const rootPath = useProjectStore.getState().rootPath

    if (filePath.startsWith('untitled:')) {
      const savePath = await window.api.saveFileDialog()
      if (!savePath) return

      await window.api.writeFile(savePath, file.content)
      const fileName = getBasename(savePath)
      const language = detectLanguageRenderer(savePath)

      set((state) => ({
        openFiles: state.openFiles.map((f) =>
          f.filePath === filePath
            ? { ...f, filePath: savePath, fileName, language, savedContent: file.content }
            : f
        ),
        activeFilePath: state.activeFilePath === filePath ? savePath : state.activeFilePath
      }))

      // Re-index with RoseLibrary
      if (rootPath) {
        window.api.indexFile(savePath, file.content, rootPath).catch(() => {})
      }
    } else {
      await window.api.writeFile(filePath, file.content)
      set((state) => ({
        openFiles: state.openFiles.map((f) =>
          f.filePath === filePath ? { ...f, savedContent: file.content } : f
        )
      }))

      // Re-index with RoseLibrary
      if (rootPath) {
        window.api.indexFile(filePath, file.content, rootPath).catch(() => {})
      }
    }
  },

  saveActiveFile: async () => {
    const { activeFilePath, saveFile } = get()
    if (activeFilePath) {
      await saveFile(activeFilePath)
    }
  },

  createNewFile: () => {
    const id = `untitled:Untitled-${++untitledCounter}`
    const file: OpenFile = {
      filePath: id,
      fileName: `Untitled-${untitledCounter}`,
      content: '',
      savedContent: '',
      language: 'plaintext'
    }
    set((state) => ({
      openFiles: [...state.openFiles, file],
      activeFilePath: id
    }))
  }
}))
