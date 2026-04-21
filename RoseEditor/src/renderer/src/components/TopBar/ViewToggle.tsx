import { useViewStore } from '../../stores/useViewStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import clsx from 'clsx'
import styles from './TopBar.module.css'

export function ViewToggle(): JSX.Element {
  const activeView = useViewStore((s) => s.activeView)
  const setActiveView = useViewStore((s) => s.setActiveView)
  const navItems = useSettingsStore((s) => s.navItems)

  return (
    <div className={styles.toggleGroup}>
      {navItems.filter((item) => item.visible).map((item, index) => (
        <button
          key={item.viewId}
          className={clsx(styles.toggleBtn, activeView === item.viewId && styles.toggleActive)}
          onClick={() => setActiveView(item.viewId)}
        >
          <span className={styles.specimenNum}>№{String(index + 1).padStart(2, '0')}</span>
          {item.label.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
