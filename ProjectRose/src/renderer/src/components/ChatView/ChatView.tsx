import { SessionSidebar } from './SessionSidebar'
import { BloomStage } from './BloomStage'
import { ChatPanel } from './ChatPanel'
import styles from './ChatView.module.css'

export function ChatView(): JSX.Element {
  return (
    <div className={styles.chatView}>
      <SessionSidebar />
      <BloomStage />
      <ChatPanel />
    </div>
  )
}
