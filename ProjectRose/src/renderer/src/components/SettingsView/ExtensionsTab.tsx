import { useState, useEffect, useCallback } from 'react'
import type { InstalledExtension, RegistryExtension } from '../../../../shared/extension-types'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useProjectStore } from '../../stores/useProjectStore'
import styles from './SettingsView.module.css'

const REGISTRY_URL =
  'https://raw.githubusercontent.com/RoseAgent/ProjectRose/master/extensions/registry.json'

type SubTab = 'installed' | 'browse'

export function ExtensionsTab(): JSX.Element {
  const [subTab, setSubTab] = useState<SubTab>('installed')
  const [installed, setInstalled] = useState<InstalledExtension[]>([])
  const [registry, setRegistry] = useState<RegistryExtension[]>([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryError, setRegistryError] = useState('')
  const [installPending, setInstallPending] = useState<string | null>(null)
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

  const loadRegistry = useCallback(async () => {
    setRegistryLoading(true)
    setRegistryError('')
    try {
      const result = await window.api.extension.fetchRegistry(REGISTRY_URL)
      setRegistry(result.extensions)
    } catch {
      setRegistryError('Failed to load extension registry. Check your internet connection.')
    } finally {
      setRegistryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (subTab === 'browse' && registry.length === 0) loadRegistry()
  }, [subTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInstall = useCallback(async (ext: RegistryExtension) => {
    if (!rootPath) return
    setInstallPending(ext.id)
    try {
      await window.api.extension.install(rootPath, ext.downloadUrl)
      if (!navItems.some((n) => n.viewId === ext.id)) {
        await updateSettings({ navItems: [...navItems, { viewId: ext.id, label: ext.name, visible: true }] })
      }
      await loadInstalled()
    } finally {
      setInstallPending(null)
    }
  }, [loadInstalled, navItems, updateSettings, rootPath])

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
    } finally {
      setDiskInstalling(false)
    }
  }, [installed, navItems, updateSettings, rootPath])

  const handleUninstall = useCallback(async (ext: InstalledExtension) => {
    if (!rootPath) return
    await window.api.extension.uninstall(rootPath, ext.manifest.id)
    await updateSettings({ navItems: navItems.filter((n) => n.viewId !== ext.manifest.id) })
    await loadInstalled()
  }, [loadInstalled, navItems, updateSettings, rootPath])

  const handleToggle = useCallback(async (id: string, currentlyEnabled: boolean) => {
    if (!rootPath) return
    if (currentlyEnabled) {
      await window.api.extension.disable(rootPath, id)
    } else {
      await window.api.extension.enable(rootPath, id)
    }
    await loadInstalled()
  }, [loadInstalled, rootPath])

  const isInstalled = (id: string): boolean => installed.some((e) => e.manifest.id === id)

  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>Extensions</div>

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--color-border)' }}>
        {(['installed', 'browse'] as SubTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSubTab(t)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: subTab === t ? '2px solid var(--color-accent)' : '2px solid transparent',
              padding: '8px 16px',
              marginBottom: -1,
              cursor: 'pointer',
              fontSize: 12,
              letterSpacing: '0.5px',
              color: subTab === t ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: subTab === t ? 600 : 400,
              transition: 'color 0.1s, border-color 0.1s',
              fontFamily: 'inherit',
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Installed tab ── */}
      {subTab === 'installed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!rootPath && (
            <div className={styles.emptyState}>Open a project to manage extensions.</div>
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
            <div className={styles.emptyState}>No extensions installed. Browse or install from disk.</div>
          )}
          {rootPath && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className={styles.refreshBtn}
                disabled={diskInstalling}
                onClick={handleInstallFromDisk}
              >
                {diskInstalling ? 'Installing...' : 'Install from disk'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Browse tab ── */}
      {subTab === 'browse' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {registryLoading && (
            <div className={styles.emptyState}>Loading extension registry...</div>
          )}
          {registryError && (
            <div className={styles.emptyState}>{registryError}</div>
          )}
          {!registryLoading && !registryError && registry.length === 0 && (
            <div className={styles.emptyState}>No extensions found in registry.</div>
          )}
          {registry.map((ext) => (
            <ExtensionRow
              key={ext.id}
              name={ext.name}
              description={ext.description}
              version={ext.version}
              author={ext.author}
              badge={undefined}
              enabled={true}
              onToggle={undefined}
              onUninstall={undefined}
              installButton={
                isInstalled(ext.id) ? (
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', letterSpacing: '0.5px' }}>
                    Installed
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.refreshBtn}
                    disabled={installPending === ext.id || !rootPath}
                    onClick={() => handleInstall(ext)}
                  >
                    {installPending === ext.id ? 'Installing...' : 'Install'}
                  </button>
                )
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}

interface ExtensionRowProps {
  name: string
  description: string
  version: string
  author: string
  badge?: string
  enabled: boolean
  onToggle?: () => void
  onUninstall?: () => void
  installButton?: React.ReactNode
}

function ExtensionRow({
  name, description, version, author, badge,
  enabled, onToggle, onUninstall, installButton
}: ExtensionRowProps) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {name}
          </span>
          {badge && (
            <span style={{
              fontSize: 9,
              letterSpacing: '1px',
              padding: '1px 6px',
              border: '1px solid var(--color-text-secondary)',
              color: 'var(--color-text-secondary)',
              borderRadius: 2,
              flexShrink: 0,
            }}>
              {badge.toUpperCase()}
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          {description}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
          v{version} · {author}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {installButton}
        {onToggle && (
          <button type="button" className={styles.refreshBtn} onClick={onToggle}>
            {enabled ? 'Disable' : 'Enable'}
          </button>
        )}
        {onUninstall && (
          <button type="button" className={styles.refreshBtn} onClick={onUninstall}>
            Uninstall
          </button>
        )}
      </div>
    </div>
  )
}
