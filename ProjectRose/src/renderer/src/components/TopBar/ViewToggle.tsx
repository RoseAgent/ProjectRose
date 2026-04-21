import { useViewStore } from '../../stores/useViewStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import clsx from 'clsx'
import styles from './TopBar.module.css'

export function ViewToggle(): JSX.Element {
  const activeView = useViewStore((s) => s.activeView)
  const setActiveView = useViewStore((s) => s.setActiveView)
  const navItems = useSettingsStore((s) => s.navItems)

  const visibleItems = navItems.filter((item) => item.visible && item.viewId !== 'settings')
  const settingsItem = navItems.find((item) => item.viewId === 'settings')

  return (
    <div className={styles.toggleGroup}>
      {visibleItems.map((item, index) => (
        <button
          key={item.viewId}
          className={clsx(styles.toggleBtn, activeView === item.viewId && styles.toggleActive)}
          onClick={() => setActiveView(item.viewId)}
        >
          <span className={styles.specimenNum}>№{String(index + 1).padStart(2, '0')}</span>
          {item.label.toUpperCase()}
        </button>
      ))}
      {settingsItem && (
        <button
          key="settings"
          className={clsx(styles.toggleBtn, activeView === 'settings' && styles.toggleActive)}
          onClick={() => setActiveView('settings')}
        >
          <span className={styles.specimenNum}>№{String(visibleItems.length + 1).padStart(2, '0')}</span>
          SETTINGS
        </button>
      )}
    </div>
  )
}
