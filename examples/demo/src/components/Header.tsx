import { useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { useUiStore } from '../store/zustand/useUiStore'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  const { user } = useContext(AuthContext)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  return (
    <header className="header">
      <button className="hamburger" onClick={toggleSidebar} aria-label="Toggle sidebar">
        ☰
      </button>
      <h1>Task Board</h1>
      <div className="header-right">
        <span className="user">{user.name}</span>
        <ThemeToggle />
      </div>
    </header>
  )
}
