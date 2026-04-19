import { useEffect, useState } from 'react'
import { useProjectStore } from '../../stores/useProjectStore'
import { useThemeStore } from '../../stores/useThemeStore'
import styles from './WelcomeView.module.css'

interface WelcomeViewProps {
  onOpenFolder: () => void
}

export function WelcomeView({ onOpenFolder }: WelcomeViewProps): JSX.Element {
  const recentProjects = useProjectStore((s) => s.recentProjects)
  const loadRecentProjects = useProjectStore((s) => s.loadRecentProjects)
  const openFolder = useProjectStore((s) => s.openFolder)
  const removeRecent = useProjectStore((s) => s.removeRecent)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const [defaultProjectPath, setDefaultProjectPath] = useState<string | null>(null)

  useEffect(() => {
    loadRecentProjects()
    window.api.getDefaultProjectPath().then(setDefaultProjectPath)
  }, [loadRecentProjects])

  const handleRecentClick = (path: string): void => {
    openFolder(path)
  }

  const handleRemove = (e: React.MouseEvent, path: string): void => {
    e.stopPropagation()
    removeRecent(path)
  }

  return (
    <div className={styles.welcome}>
      <button className={styles.themeBtn} onClick={toggleTheme} title="Toggle theme">
        {theme === 'dark' ? '\u2600' : '\u263D'}
      </button>

      <div className={styles.header}>
        <div className={styles.title}>RoseEditor</div>
        <div className={styles.subtitle}>A code editor for local AI</div>
      </div>

      <div className={styles.actions}>
        {defaultProjectPath && (
          <button className={styles.defaultBtn} onClick={() => openFolder(defaultProjectPath)}>
            Default Project
          </button>
        )}
        <button className={styles.openBtn} onClick={onOpenFolder}>
          Open Project
        </button>
      </div>

      <div className={styles.recentsSection}>
        <div className={styles.recentsTitle}>Recent Projects</div>
        <div className={styles.recentsList}>
          {recentProjects.length === 0 ? (
            <div className={styles.emptyRecents}>
              No recent projects
            </div>
          ) : (
            recentProjects.map((project) => (
              <div
                key={project.path}
                className={styles.recentItem}
                onClick={() => handleRecentClick(project.path)}
              >
                <div className={styles.recentInfo}>
                  <div className={styles.recentName}>{project.name}</div>
                  <div className={styles.recentPath}>{project.path}</div>
                </div>
                <button
                  className={styles.removeBtn}
                  onClick={(e) => handleRemove(e, project.path)}
                  title="Remove from recents"
                >
                  &times;
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
