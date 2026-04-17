import { useSelector } from 'react-redux'
import type { RootState } from '../store/redux/store'

// Intentionally subscribes to the full items array (over-subscription anti-pattern).
// Re-renders on every task change even when doneCount hasn't changed — wasted render.
export function TaskStats() {
  const items = useSelector((state: RootState) => state.tasks.items)
  const doneCount = items.filter((t) => t.status === 'done').length

  return (
    <div className="task-stats">
      <span>Total: {items.length}</span>
      <span>Done: {doneCount}</span>
    </div>
  )
}
