import { useProjectStore } from '../../stores/useProjectStore'
import { RoseMark } from './RoseMark'
import { ViewToggle } from './ViewToggle'
import { ThemeToggle } from './ThemeToggle'
import { IndexingStatus } from './IndexingStatus'
import { Breadcrumbs } from '../Breadcrumbs/Breadcrumbs'
import styles from './TopBar.module.css'

export function TopBar(): JSX.Element {
  const rootPath = useProjectStore((s) => s.rootPath)
  const projectName = rootPath
    ? rootPath.replace(/\\/g, '/').split('/').pop() || 'rose-editor'
    : 'rose-editor'

  return (
    <div className={styles.topBar}>
      <div className={styles.hairline} />

      {/* brand lockup */}
      <div className={styles.brand}>
        <RoseMark size={24} />
        <div className={styles.wordmark}>
          <div className={styles.wordmarkName}>
            Project<span className={styles.wordmarkRose}>Rose</span>
          </div>
          <div className={styles.wordmarkSub}>№ 01 · {projectName}</div>
        </div>
      </div>

      <div className={styles.divider} />

      {/* breadcrumb — fills remaining left space */}
      <div className={styles.breadcrumbZone}>
        <Breadcrumbs />
      </div>

      <div className={styles.spacer} />

      <ViewToggle />

      <div className={styles.spacer} />

      <div className={styles.right}>
        <IndexingStatus />
        <ThemeToggle />
      </div>
    </div>
  )
}
