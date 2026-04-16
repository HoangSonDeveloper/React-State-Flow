import { createContext, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

export interface ThemeContextValue {
  theme: Theme
  toggle: () => void
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const toggle = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}
