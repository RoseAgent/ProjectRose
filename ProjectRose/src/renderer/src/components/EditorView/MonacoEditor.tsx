import { useRef, useEffect } from 'react'
import Editor, { type OnMount, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useFileStore } from '../../stores/useFileStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { roseDarkTheme, roseHerbariumTheme } from '../../themes/monacoThemes'
import { initLspClient } from '../../services/lspClient'

// Configure Monaco to use local workers instead of CDN
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

loader.config({ monaco })

// Monaco's built-in TS/JS language service runs in an isolated worker with only
// the currently-open buffer in scope — it can't see the rest of the project, so
// every cross-file import surfaces as a false "Cannot find module" error.
// Disable semantic validation so real syntax errors still surface but
// cross-file type checking doesn't produce noise.
for (const defaults of [
  monaco.languages.typescript.typescriptDefaults,
  monaco.languages.typescript.javascriptDefaults
]) {
  defaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true
  })
}

let themesRegistered = false
let lspInitialized = false

export function MonacoEditor(): JSX.Element | null {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const activeFile = useFileStore((s) => {
    const path = s.activeFilePath
    return s.openFiles.find((f) => f.filePath === path) || null
  })
  const updateContent = useFileStore((s) => s.updateContent)
  const theme = useThemeStore((s) => s.theme)

  const handleMount: OnMount = (editorInstance, monacoInstance) => {
    editorRef.current = editorInstance

    if (!themesRegistered) {
      monacoInstance.editor.defineTheme('rose-dark', roseDarkTheme)
      monacoInstance.editor.defineTheme('rose-herbarium', roseHerbariumTheme)
      themesRegistered = true
    }

    monacoInstance.editor.setTheme(theme === 'dark' ? 'rose-dark' : 'rose-herbarium')

    if (!lspInitialized) {
      lspInitialized = true
      initLspClient()
    }
  }

  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(theme === 'dark' ? 'rose-dark' : 'rose-herbarium')
    }
  }, [theme])

  if (!activeFile) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '14px'
        }}
      >
        Open a file to start editing
      </div>
    )
  }

  return (
    <Editor
      key={activeFile.filePath}
      height="100%"
      language={activeFile.language}
      value={activeFile.content}
      theme={theme === 'dark' ? 'rose-dark' : 'rose-herbarium'}
      onChange={(value) => {
        if (value !== undefined) {
          updateContent(activeFile.filePath, value)
        }
      }}
      onMount={handleMount}
      options={{
        fontFamily: theme === 'dark'
          ? "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace"
          : "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 14,
        lineHeight: 20,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
        tabSize: 2,
        wordWrap: 'off',
        automaticLayout: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        smoothScrolling: true,
        padding: { top: 8 }
      }}
    />
  )
}
