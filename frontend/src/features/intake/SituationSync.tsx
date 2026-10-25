import { useEffect } from 'react'
import { syncSituation } from '../../services/situation.ts'
import { useAuth } from '../auth/AuthContext.ts'
import { useIntakeDraft } from './IntakeContext.ts'

// Saves the intake once the signed-in workspace is open, and patches it after later edits.
export function SituationSync() {
  const { user } = useAuth()
  const { draft, setSaved } = useIntakeDraft()

  useEffect(() => {
    if (!user) return
    let current = true
    const timer = window.setTimeout(() => {
      void syncSituation(draft).then(
        (saved) => {
          if (current) setSaved(saved)
        },
        () => undefined,
      )
    }, 400)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [user, draft, setSaved])

  return null
}
