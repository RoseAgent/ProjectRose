import { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import { useDockerStore } from '@renderer/stores/useDockerStore'
import { useThemeStore } from '@renderer/stores/useThemeStore'
import styles from './DockerView.module.css'

interface Props {
  containerId: string
}

export function InspectTab({ containerId }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const cached = useDockerStore((s) => s.inspectCache[containerId])
  const setInspect = useDockerStore((s) => s.setInspect)
  const theme = useThemeStore((s) => s.theme)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const editor = monaco.editor.create(containerRef.current, {
      value: cached ? JSON.stringify(cached, null, 2) : '// Loading...',
      language: 'json',
      readOnly: true,
      minimap: { enabled: false },
      automaticLayout: true,
      theme: theme === 'dark' ? 'rose-dark' : 'rose-light',
      fontSize: 12,
      wordWrap: 'off'
    })
    editorRef.current = editor
    return () => {
      editor.dispose()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    window.api.docker.inspect(containerId)
      .then((data) => {
        if (cancelled) return
        setInspect(containerId, data)
        if (editorRef.current) {
          editorRef.current.setValue(JSON.stringify(data, null, 2))
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(String(err))
      })
    return () => { cancelled = true }
  }, [containerId, setInspect])

  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(theme === 'dark' ? 'rose-dark' : 'rose-light')
    }
  }, [theme])

  return (
    <div className={styles.inspectContainer}>
      {error && <div className={styles.error}>{error}</div>}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
