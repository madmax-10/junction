import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, clearSession, getRefreshToken, setTokens } from '../../services/api.ts'
import { resetPersistedSituation } from '../../services/situation.ts'
import type { AuthUser } from '../../types/auth.ts'
import { AuthContext } from './AuthContext.ts'

type Account = {
  id: string
  name: string
  email: string
}

async function loadAccount() {
  const account = await api<Account>('/api/auth/me/')
  return { id: account.id, name: account.name, email: account.email }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    let current = true
    async function restore() {
      if (!getRefreshToken()) return
      try {
        const account = await loadAccount()
        if (current) setUser(account)
      } catch {
        clearSession()
      }
    }
    void restore().finally(() => {
      if (current) setIsReady(true)
    })
    return () => {
      current = false
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const tokens = await api<{ access: string; refresh: string }>('/api/auth/login/', {
      method: 'POST',
      auth: false,
      body: { email, password },
    })
    setTokens(tokens.access, tokens.refresh)
    setUser(await loadAccount())
  }, [])

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      await api('/api/auth/register/', {
        method: 'POST',
        auth: false,
        body: { name, email, password },
      })
      await signIn(email, password)
    },
    [signIn],
  )

  const signOut = useCallback(() => {
    clearSession()
    resetPersistedSituation()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, isReady, signIn, signUp, signOut }),
    [user, isReady, signIn, signUp, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
