import { useEffect, useState } from 'react'
import { useProjectStore } from '../../stores/useProjectStore'
import { useThemeStore } from '../../stores/useThemeStore'
import styles from './WelcomeView.module.css'

interface WelcomeViewProps {
  onOpenFolder: () => void
}

function LearnModal({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>About Project Rose</div>
          <button className={styles.modalClose} onClick={onClose}>&times;</button>
        </div>
        <div className={styles.modalBody}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>What is Project Rose?</h3>
            <p className={styles.sectionText}>
              Project Rose is a local AI coding assistant that lives inside your projects.
              Unlike cloud-based tools, it runs entirely on your machine — your code and
              conversations never leave your computer.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>The Agent's Home</h3>
            <p className={styles.sectionText}>
              Every project you open becomes the agent's home. On first open, the agent
              is initialized with a name, identity, and autonomy level you choose. It
              creates a structured workspace inside the project:
            </p>
            <ul className={styles.list}>
              <li><code className={styles.code}>ROSE.md</code> — the agent's identity and behavioral guidelines</li>
              <li><code className={styles.code}>memory/</code> — long-term knowledge about people, places, and things</li>
              <li><code className={styles.code}>heartbeat/</code> — deferred notes, scheduled tasks, and run logs</li>
              <li><code className={styles.code}>tools/</code> — Python scripts the agent can create and reuse</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Memory</h3>
            <p className={styles.sectionText}>
              When you mention a person, place, or thing, the agent reads the relevant
              memory file to recall context. When it learns something new, it writes a
              note to <code className={styles.code}>heartbeat/notes/</code> rather than
              interrupting the conversation — the heartbeat processes those notes later.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>The Heartbeat</h3>
            <p className={styles.sectionText}>
              Every 5 minutes (and on startup), a background heartbeat runs. It processes
              accumulated notes into memory files, executes any scheduled tasks that are
              due, and commits all agent file changes to git — so you have a full history
              of how the agent's understanding evolved over time.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Tools</h3>
            <p className={styles.sectionText}>
              Drop any Python script into <code className={styles.code}>tools/</code> with
              a docstring describing its parameters and it becomes a live tool the agent
              can call. The agent will also create tools on its own when it spots a task
              likely to repeat.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Autonomy</h3>
            <p className={styles.sectionText}>
              You control how independently the agent acts. At <strong>High</strong> autonomy
              it executes without asking. At <strong>Medium</strong> it confirms before
              destructive actions. At <strong>Low</strong> it asks before every tool call.
              This is set per-project in <code className={styles.code}>ROSE.md</code> and
              can be edited at any time.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export function WelcomeView({ onOpenFolder }: WelcomeViewProps): JSX.Element {
  const recentProjects = useProjectStore((s) => s.recentProjects)
  const loadRecentProjects = useProjectStore((s) => s.loadRecentProjects)
  const openFolder = useProjectStore((s) => s.openFolder)
  const removeRecent = useProjectStore((s) => s.removeRecent)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const [defaultProjectPath, setDefaultProjectPath] = useState<string | null>(null)
  const [showLearn, setShowLearn] = useState(false)

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
      {showLearn && <LearnModal onClose={() => setShowLearn(false)} />}

      <button className={styles.themeBtn} onClick={toggleTheme} title="Toggle theme">
        {theme === 'dark' ? '\u2600' : '\u263D'}
      </button>

      <div className={styles.header}>
        <div className={styles.title}>ProjectRose</div>
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

      <button className={styles.learnBtn} onClick={() => setShowLearn(true)}>
        Learn About Project Rose
      </button>

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
