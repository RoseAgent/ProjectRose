import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useDockerStore } from './store'
import '@xterm/xterm/css/xterm.css'
import styles from './DockerView.module.css'

interface Props {
  containerId: string
}

export function LogsTab({ containerId }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const attachLogs = useDockerStore((s) => s.attachLogs)
  const detachLogs = useDockerStore((s) => s.detachLogs)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.3,
      convertEol: true,
      disableStdin: true,
      theme: { background: '#11111b', foreground: '#cdd6f4' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    termRef.current = term
    fitRef.current = fit
    setTimeout(() => { try { fit.fit() } catch {} }, 50)

    const cleanup = window.api.on('rose-docker:logsData', (payload) => {
      const entry = useDockerStore.getState().logs[containerId]
      if (!entry || entry.sessionId !== payload.sessionId) return
      term.write(payload.chunk)
    })

    attachLogs(containerId).then(() => {
      const entry = useDockerStore.getState().logs[containerId]
      if (entry) {
        for (const chunk of entry.buffer) term.write(chunk)
      }
    }).catch((err) => {
      term.write(`\x1b[31m[Failed to attach logs: ${String(err)}]\x1b[0m\r\n`)
    })

    const observer = new ResizeObserver(() => {
      try { fit.fit() } catch {}
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      cleanup()
      detachLogs(containerId).catch(() => {})
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [containerId, attachLogs, detachLogs])

  return <div className={styles.logsContainer} ref={containerRef} />
}
