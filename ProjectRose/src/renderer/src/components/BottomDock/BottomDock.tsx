import { useStatusStore } from '../../stores/useStatusStore'
import { useUpdaterStore } from '../../stores/useUpdaterStore'
import { useThemeStore } from '../../stores/useThemeStore'
import { useAppsDrawerStore } from '../../stores/useAppsDrawerStore'
import { useViewStore } from '../../stores/useViewStore'
import { RoseMark } from '../TopBar/RoseMark'
import clsx from 'clsx'
import styles from './BottomDock.module.css'

export function BottomDock(): JSX.Element {
  const closeDrawer = useAppsDrawerStore((s) => s.close)

  const activeView = useViewStore((s) => s.activeView)
  const setActiveView = useViewStore((s) => s.setActiveView)

  const message = useStatusStore((s) => s.message)
  const tone = useStatusStore((s) => s.tone)
  const updaterPhase = useUpdaterStore((s) => s.phase)
  const updaterVersion = useUpdaterStore((s) => s.version)
  const showUpdaterToast = useUpdaterStore((s) => s.showToast)

  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  const isIdle = message === null
  const updateReady = updaterPhase === 'ready'

  const onSettingsView = activeView === 'settings'
  const fabLabel = onSettingsView ? 'Close settings' : 'Settings'

  const onFabClick = (): void => {
    closeDrawer()
    setActiveView(onSettingsView ? 'chat' : 'settings')
  }

  return (
    <div className={styles.dock}>
      <div className={styles.topGlow} />

      <div className={styles.fabRow} aria-hidden="true" />

      <button
        type="button"
        className={clsx(styles.fab, onSettingsView && styles.fabActive)}
        onClick={onFabClick}
        title={fabLabel}
        aria-label={fabLabel}
        aria-expanded={onSettingsView}
      >
        <span className={styles.fabBreathRing} />
        <RoseMark size={32} />
      </button>

      <div className={styles.statusRow}>
        <span className={clsx(styles.statusMessage, isIdle && styles.statusIdle)} key={message ?? 'idle'}>
          <span className={clsx(styles.statusDot, !isIdle && styles[`tone_${tone}`])} />
          {isIdle ? 'READY' : message}
        </span>

        {updateReady && (
          <>
            <span className={styles.sep}>│</span>
            <button
              type="button"
              className={styles.updateBadge}
              onClick={showUpdaterToast}
              title={`Restart to install v${updaterVersion ?? ''}`}
            >
              <span className={styles.updateDot} />
              UPDATE READY
            </button>
          </>
        )}

        <div className={styles.spacer} />

        <button
          type="button"
          className={styles.themePill}
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Herbarium' : 'Switch to Dark'}
        >
          {theme === 'dark' ? '☽ DARK' : '☀ PAPER'}
        </button>
        <span className={styles.sep}>│</span>
        <span className={styles.brand}>ROSE</span>
        <span className={styles.version}>v{__APP_VERSION__}</span>
      </div>
    </div>
  )
}
