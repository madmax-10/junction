import { createContext, useContext } from 'react'
import type { IntakeDraft, VehicleInfo } from '../../types/intake.ts'

export type IntakeContextValue = {
  draft: IntakeDraft
  updateDraft: (changes: Partial<Omit<IntakeDraft, 'vehicle'>>) => void
  updateVehicle: (changes: Partial<VehicleInfo>) => void
  resetDraft: () => void
}

export const emptyIntakeDraft: IntakeDraft = {
  accidentType: null,
  situation: null,
  details: '',
  vehicle: {
    make: null,
    model: null,
    year: null,
    mileage: '',
    trim: '',
  },
  interests: [],
  question: '',
}

export const IntakeContext = createContext<IntakeContextValue | null>(null)

export function useIntakeDraft() {
  const context = useContext(IntakeContext)
  if (!context) {
    throw new Error('useIntakeDraft must be used within IntakeProvider')
  }
  return context
}
