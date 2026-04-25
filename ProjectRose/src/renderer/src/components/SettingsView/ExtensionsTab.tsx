import { useState, useEffect, useCallback } from 'react'
import type { InstalledExtension } from '../../../../shared/extension-types'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { loadDynamicExtensions } from '../../extensions/registry'
import styles from './SettingsView.module.css'

export function ExtensionsTab(): JSX.Element {
  const [installed, setInstalled] = useState<InstalledExtension[]>([])
  const [diskInstalling, setDiskInstalling] = useState(false)

  const rootPath = useProjectStore((s) => s.rootPath)
  const navItems = useSettingsStore((s) => s.navItems)
  const updateSettings = useSettingsStore((s) => s.update)

  const loadInstalled = useCallback(async () => {
    if (!rootPath) { setInstalled([]); return }
    const result = await window.api.extension.list(rootPath)
    setInstalled(result.installed)
  }, [rootPath])

  useEffect(() => { loadInstalled() }, [loadInstalled])

  const handleInstallFromDisk = useCallback(async () => {
    if (!rootPath) return
    setDiskInstalling(true)
    try {
      const result = await window.api.extension.installFromDisk(rootPath)
      if (!result.ok || result.canceled) return

      const { installed: newInstalled } = await window.api.extension.list(rootPath)
      setInstalled(newInstalled)

      const prevIds = new Set(installed.map((e) => e.manifest.id))
      const added = newInstalled.filter((e) => !prevIds.has(e.manifest.id) && e.manifest.navItem)
      const newNavItems = added
        .filter((e) => !navItems.some((n) => n.viewId === e.manifest.id))
        .map((e) => ({ viewId: e.manifest.id, label: e.manifest.navItem!.label, visible: true }))
      if (newNavItems.length > 0) {
        await updateSettings({ navItems: [...navItems, ...newNavItems] })
      }
      await loadDynamicExtensions(rootPath)
    } finally {
      setDiskInstalling(false)
    }
  }, [installed, navItems, updateSettings, rootPath])

  const handleUninstall = useCallback(async (ext: InstalledExtension) => {
    if (!rootPath) return
    await window.api.extension.uninstall(rootPath, ext.manifest.id)
    await updateSettings({ navItems: navItems.filter((n) => n.viewId !== ext.manifest.id) })
    await loadInstalled()
    await loadDynamicExtensions(rootPath)
  }, [loadInstalled, navItems, updateSettings, rootPath])

  const handleToggle = useCallback(async (id: string, currentlyEnabled: boolean) => {
    if (!rootPath) return
    if (currentlyEnabled) {
      await window.api.extension.disable(rootPath, id)
    } else {
      await window.api.extension.enable(rootPath, id)
    }
    await loadInstalled()
    await loadDynamicExtensions(rootPath)
  }, [loadInstalled, rootPath])

  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>Extensions</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!rootPath && (
          <div className={styles.emptyState}>Open a project to manage extensions.</div>
        )}
        {rootPath && (
          <button
            type="button"
            disabled={diskInstalling}
            onClick={handleInstallFromDisk}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '14px 16px',
              background: 'none',
              border: '1px dashed var(--color-border-strong, var(--color-border))',
              borderRadius: 'var(--radius-md, 6px)',
              color: diskInstalling ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
              cursor: diskInstalling ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-family-mono)',
              fontSize: 11,
              letterSpacing: '1px',
              textAlign: 'left',
              transition: 'border-color 0.1s, color 0.1s, background 0.1s',
              opacity: diskInstalling ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!diskInstalling) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-primary)'
                ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--color-button-hover-bg, rgba(255,255,255,0.03))'
              }
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = ''
              ;(e.currentTarget as HTMLButtonElement).style.color = diskInstalling ? 'var(--color-text-muted)' : 'var(--color-text-secondary)'
              ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>+</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, letterSpacing: '1px' }}>
                {diskInstalling ? 'INSTALLING...' : 'INSTALL FROM DISK'}
              </span>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.3px', fontFamily: 'inherit' }}>
                Load a local .rose extension bundle
              </span>
            </div>
          </button>
        )}
        {rootPath && installed.map((ext) => (
          <ExtensionRow
            key={ext.manifest.id}
            name={ext.manifest.name}
            description={ext.manifest.description}
            version={ext.manifest.version}
            author={ext.manifest.author}
            enabled={ext.enabled}
            onToggle={() => handleToggle(ext.manifest.id, ext.enabled)}
            onUninstall={() => handleUninstall(ext)}
          />
        ))}
        {rootPath && installed.length === 0 && (
          <div className={styles.emptyState}>No extensions installed. Use "Install from disk" to add one.</div>
        )}
      </div>
    </section>
  )
}

interface ExtensionRowProps {
  name: string
  description: string
  version: string
  author: string
  enabled: boolean
  onToggle: () => void
  onUninstall: () => void
}

function ExtensionRow({ name, description, version, author, enabled, onToggle, onUninstall }: ExtensionRowProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      padding: '14px 16px',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md, 6px)',
      background: 'var(--color-bg-secondary)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {name}
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          {description}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
          v{version} · {author}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button type="button" className={styles.refreshBtn} onClick={onToggle}>
          {enabled ? 'Disable' : 'Enable'}
        </button>
        <button type="button" className={styles.refreshBtn} onClick={onUninstall}>
          Uninstall
        </button>
      </div>
    </div>
  )
}
