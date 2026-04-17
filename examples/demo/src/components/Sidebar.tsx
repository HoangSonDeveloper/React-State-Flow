import { useUiStore } from '../store/zustand/useUiStore'
import { FilterBar } from './FilterBar'
import { AddTaskForm } from './AddTaskForm'
import { TaskStats } from './TaskStats'

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  if (!sidebarOpen) return null
  return (
    <aside className="sidebar">
      <h2>Tools</h2>
      <TaskStats />
      <FilterBar />
      <AddTaskForm />
    </aside>
  )
}
