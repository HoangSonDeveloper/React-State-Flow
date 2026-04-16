import { useContext } from 'react'
import { ThemeContext } from '../contexts/ThemeContext'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { Board } from './Board'

export function Layout() {
  const { theme } = useContext(ThemeContext)
  return (
    <div className={`layout layout--${theme}`}>
      <Header />
      <div className="layout-body">
        <Sidebar />
        <Board />
      </div>
    </div>
  )
}
