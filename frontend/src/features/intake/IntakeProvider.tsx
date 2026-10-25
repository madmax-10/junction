import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { IntakeDraft, VehicleInfo } from '../../types/intake.ts'
import { emptyIntakeDraft, IntakeContext } from './IntakeContext.ts'

export function IntakeProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<IntakeDraft>(emptyIntakeDraft)

  const updateDraft = useCallback((changes: Partial<Omit<IntakeDraft, 'vehicle'>>) => {
    setDraft((current) => ({ ...current, ...changes }))
  }, [])

  const updateVehicle = useCallback((changes: Partial<VehicleInfo>) => {
    setDraft((current) => ({ ...current, vehicle: { ...current.vehicle, ...changes } }))
  }, [])

  const resetDraft = useCallback(() => setDraft(emptyIntakeDraft), [])

  const value = useMemo(
    () => ({ draft, updateDraft, updateVehicle, resetDraft }),
    [draft, updateDraft, updateVehicle, resetDraft],
  )

  return <IntakeContext value={value}>{children}</IntakeContext>
}
