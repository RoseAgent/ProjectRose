import { SessionSidebar } from './SessionSidebar'
import styles from './ChatView.module.css'

export function ChatView(): JSX.Element {
  return (
    <div className={styles.chatView}>
      <SessionSidebar />
    </div>
  )
}
