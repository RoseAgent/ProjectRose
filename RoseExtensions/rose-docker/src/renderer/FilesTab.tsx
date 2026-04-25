import { useEffect, useState, useCallback } from 'react'
import type { DockerDirEntry, DockerMount } from './store'
import styles from './DockerView.module.css'

interface Props {
  containerId: string
}

function joinPath(base: string, name: string): string {
  if (base.endsWith('/')) return base + name
  return base + '/' + name
}

function crumbsOf(path: string): { label: string; path: string }[] {
  if (path === '/') return [{ label: '/', path: '/' }]
  const parts = path.split('/').filter(Boolean)
  const out: { label: string; path: string }[] = [{ label: '/', path: '/' }]
  let cur = ''
  for (const p of parts) {
    cur += '/' + p
    out.push({ label: p, path: cur })
  }
  return out
}

export function FilesTab({ containerId }: Props): JSX.Element {
  const [path, setPath] = useState('/')
  const [entries, setEntries] = useState<DockerDirEntry[]>([])
  const [mounts, setMounts] = useState<DockerMount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (p: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.invoke('rose-docker:listFiles', containerId, p) as { entries: DockerDirEntry[] }
      setEntries(res.entries)
    } catch (err) {
      setError(String(err))
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [containerId])

  useEffect(() => {
    setPath('/')
    ;(window.api.invoke('rose-docker:mounts', containerId) as Promise<DockerMount[]>).then(setMounts).catch(() => setMounts([]))
  }, [containerId])

  useEffect(() => { load(path) }, [load, path])

  const crumbs = crumbsOf(path)

  return (
    <div className={styles.filesContainer}>
      <div className={styles.mountsSection}>
        <div className={styles.sectionHeader}>Mounts</div>
        {mounts.length === 0 ? (
          <div className={styles.placeholder}>No mounts</div>
        ) : (
          mounts.map((m, i) => (
            <div key={i} className={styles.mountRow}>
              <span className={styles.mountType}>{m.Type}</span>
              <span className={styles.mountPath}>
                {m.Source} → {m.Destination}
                {' '}
                <button className={styles.crumb} onClick={() => setPath(m.Destination)}>browse</button>
              </span>
            </div>
          ))
        )}
      </div>

      <div className={styles.filesSection}>
        <div className={styles.sectionHeader}>Files</div>
        <div className={styles.breadcrumb}>
          {crumbs.map((c, i) => (
            <span key={c.path}>
              <button className={styles.crumb} onClick={() => setPath(c.path)}>{c.label}</button>
              {i < crumbs.length - 1 && c.path !== '/' && <span className={styles.crumbSep}>/</span>}
            </span>
          ))}
        </div>
        {error && <div className={styles.error}>{error}</div>}
        {loading && <div className={styles.placeholder}>Loading...</div>}
        {!loading && !error && entries.length === 0 && (
          <div className={styles.placeholder}>(empty)</div>
        )}
        {!loading && entries.map((e) => (
          <div
            key={e.name}
            className={e.type === 'dir' ? styles.dirEntry : styles.fileEntry}
            onClick={() => {
              if (e.type === 'dir') setPath(joinPath(path, e.name))
            }}
          >
            <span>{e.type === 'dir' ? `${e.name}/` : e.name}</span>
            <span className={styles.fileSize}>
              {e.type === 'file' ? `${e.size}` : e.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
