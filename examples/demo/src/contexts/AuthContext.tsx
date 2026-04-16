import { createContext, useState, type ReactNode } from 'react'

export interface User {
  name: string
  email: string
}

export interface AuthContextValue {
  user: User
  login: (name: string) => void
}

export const AuthContext = createContext<AuthContextValue>({
  user: { name: 'Guest', email: 'guest@example.com' },
  login: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>({
    name: 'Son Nguyen',
    email: 'son@example.com',
  })
  const login = (name: string) => setUser({ name, email: `${name.toLowerCase()}@example.com` })
  return (
    <AuthContext.Provider value={{ user, login }}>
      {children}
    </AuthContext.Provider>
  )
}
