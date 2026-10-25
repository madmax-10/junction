import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { AuthUser } from '../../types/auth.ts'
import { AuthContext } from './AuthContext.ts'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)

  const signIn = useCallback((nextUser: AuthUser) => setUser(nextUser), [])
  const signOut = useCallback(() => setUser(null), [])

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut])

  return <AuthContext value={value}>{children}</AuthContext>
}
