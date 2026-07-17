import { useProjectStore } from '../../stores/useProjectStore'
import { BrandMenu } from './BrandMenu'
import styles from './TopBar.module.css'

export function TopBar(): JSX.Element {
  const rootPath = useProjectStore((s) => s.rootPath)
  const projectName = rootPath
    ? rootPath.replace(/\\/g, '/').split('/').pop() || 'rose-editor'
    : 'no workspace'

  return (
    <div className={styles.topBar}>
      <div className={styles.hairline} />
      <BrandMenu projectName={projectName} />
    </div>
  )
}
