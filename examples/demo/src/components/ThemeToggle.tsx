import { useContext } from 'react'
import { ThemeContext } from '../contexts/ThemeContext'

export function ThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext)
  return (
    <button className="theme-toggle" onClick={toggle}>
      {theme === 'light' ? '🌙' : '☀️'} {theme}
    </button>
  )
}
