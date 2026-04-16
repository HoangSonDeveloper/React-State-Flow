import { useSelector } from 'react-redux'
import { useUiStore } from '../store/zustand/useUiStore'
import type { RootState } from '../store/redux/store'
import type { TaskStatus } from '../store/redux/tasksSlice'
import { Column } from './Column'

const STATUSES: TaskStatus[] = ['todo', 'doing', 'done']

export function Board() {
  const tasks = useSelector((state: RootState) => state.tasks.items)
  const filter = useUiStore((s) => s.filter)

  const filtered = filter
    ? tasks.filter((t) => t.title.toLowerCase().includes(filter.toLowerCase()))
    : tasks

  return (
    <main className="board">
      {STATUSES.map((status) => (
        <Column
          key={status}
          status={status}
          tasks={filtered.filter((t) => t.status === status)}
        />
      ))}
    </main>
  )
}
