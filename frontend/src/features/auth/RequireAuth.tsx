import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { paths } from '../../app/paths.ts'
import { useAuth } from './AuthContext.ts'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to={paths.signIn} replace state={{ from: location.pathname }} />
  }

  return children
}
