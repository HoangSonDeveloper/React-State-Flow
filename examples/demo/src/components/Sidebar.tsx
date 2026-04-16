import { useUiStore } from '../store/zustand/useUiStore'
import { FilterBar } from './FilterBar'
import { AddTaskForm } from './AddTaskForm'

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  if (!sidebarOpen) return null
  return (
    <aside className="sidebar">
      <h2>Tools</h2>
      <FilterBar />
      <AddTaskForm />
    </aside>
  )
}
