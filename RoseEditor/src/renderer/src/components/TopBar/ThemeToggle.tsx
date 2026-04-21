import { useThemeStore } from '../../stores/useThemeStore'
import styles from './TopBar.module.css'

export function ThemeToggle(): JSX.Element {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  return (
    <button
      className={styles.themeBtn}
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to Herbarium' : 'Switch to Dark'}
    >
      {theme === 'dark' ? '\u263D DARK' : '\u2600 PAPER'}
    </button>
  )
}
