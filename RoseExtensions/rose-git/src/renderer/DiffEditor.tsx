import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { useThemeStore } from '@renderer/stores/useThemeStore'
import styles from './GitView.module.css'

interface Props {
  oldContent: string
  newContent: string
  language?: string
  binary?: boolean
}

function inferLanguage(path?: string): string | undefined {
  if (!path) return undefined
  const ext = path.split('.').pop()?.toLowerCase()
  if (!ext) return undefined
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', css: 'css', scss: 'scss', less: 'less',
    html: 'html', md: 'markdown', py: 'python', go: 'go',
    rs: 'rust', java: 'java', c: 'c', cc: 'cpp', cpp: 'cpp', h: 'cpp',
    sh: 'shell', yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini',
    sql: 'sql', xml: 'xml'
  }
  return map[ext]
}

export function DiffEditor({ oldContent, newContent, language, binary }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    if (!containerRef.current || binary) return
    const lang = language || inferLanguage(language) || 'plaintext'
    const oldModel = monaco.editor.createModel(oldContent ?? '', lang)
    const newModel = monaco.editor.createModel(newContent ?? '', lang)
    const ed = monaco.editor.createDiffEditor(containerRef.current, {
      readOnly: true,
      automaticLayout: true,
      renderSideBySide: true,
      enableSplitViewResizing: true,
      ignoreTrimWhitespace: false,
      minimap: { enabled: false }
    })
    ed.setModel({ original: oldModel, modified: newModel })
    editorRef.current = ed
    monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs')
    return () => {
      try { ed.dispose() } catch {}
      try { oldModel.dispose() } catch {}
      try { newModel.dispose() } catch {}
      editorRef.current = null
    }
  }, [oldContent, newContent, language, binary, theme])

  if (binary) {
    return <div className={styles.binary}>Binary file — diff not shown</div>
  }

  return <div ref={containerRef} className={styles.diffEditor} />
}
