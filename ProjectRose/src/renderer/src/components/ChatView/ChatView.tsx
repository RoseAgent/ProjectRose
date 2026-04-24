import { SessionSidebar } from './SessionSidebar'
import { BloomStage } from './BloomStage'
import { ChatPanel } from './ChatPanel'
import { useActiveListening } from '../../hooks/useActiveListening'
import styles from './ChatView.module.css'

export function ChatView(): JSX.Element {
  useActiveListening()
  return (
    <div className={styles.chatView}>
      <SessionSidebar />
      <BloomStage />
      <ChatPanel />
    </div>
  )
}
