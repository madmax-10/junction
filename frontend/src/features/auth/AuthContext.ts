import { createContext, useContext } from 'react'
import type { AuthUser } from '../../types/auth.ts'

export type AuthContextValue = {
  user: AuthUser | null
  isReady: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
