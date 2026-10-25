import { createContext, useContext } from 'react'
import type { AuthUser } from '../../types/auth.ts'

export type AuthContextValue = {
  user: AuthUser | null
  signIn: (user: AuthUser) => void
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
