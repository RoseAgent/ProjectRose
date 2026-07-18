import { useState } from 'react'
import clsx from 'clsx'
import { useChat } from '../../stores/useChat'
import styles from './TodoChecklist.module.css'

// Live checklist of the agent's todo_write list for the current Conversation.
// Renders nothing until the agent creates a list; collapses to a one-line
// summary so it never crowds the timeline.
export function TodoChecklist(): JSX.Element | null {
  const todos = useChat((s) => s.todos)
  const [collapsed, setCollapsed] = useState(false)

  if (todos.length === 0) return null

  const done = todos.filter((t) => t.status === 'completed').length
  const active = todos.find((t) => t.status === 'in_progress')

  return (
    <div className={styles.checklist}>
      <button type="button" className={styles.header} onClick={() => setCollapsed((c) => !c)}>
        <span className={styles.caret}>{collapsed ? '▸' : '▾'}</span>
        <span className={styles.title}>TASKS</span>
        <span className={styles.count}>
          {done}/{todos.length}
        </span>
        {collapsed && active && <span className={styles.activeHint}>{active.content}</span>}
      </button>
      {!collapsed && (
        <ul className={styles.items}>
          {todos.map((todo, i) => (
            <li
              key={`${i}-${todo.content}`}
              className={clsx(
                styles.item,
                todo.status === 'completed' && styles.completed,
                todo.status === 'in_progress' && styles.inProgress
              )}
            >
              <span className={styles.marker}>
                {todo.status === 'completed' ? '●' : todo.status === 'in_progress' ? '◐' : '○'}
              </span>
              <span className={styles.label}>{todo.content}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
