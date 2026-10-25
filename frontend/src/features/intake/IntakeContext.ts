import { createContext, useContext } from 'react'
import type {
  FieldConfirmation,
  IntakeDraft,
  IntakeFields,
  SituationChanges,
  SituationSection,
  VehicleInfo,
} from '../../types/intake.ts'

export type IntakeContextValue = {
  draft: IntakeDraft
  confirmed: FieldConfirmation
  updateDraft: (changes: Partial<IntakeFields>) => void
  updateVehicle: (changes: Partial<VehicleInfo>) => void
  confirmSections: (sections: SituationSection[]) => void
  applyConfirmedChanges: (changes: SituationChanges) => void
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
  insuranceSettlement: '',
  minBudget: '',
  maxBudget: '',
}

export const situationSections: SituationSection[] = ['vehicle', 'accident', 'insurance', 'concerns']

export const noFieldsConfirmed: FieldConfirmation = {
  make: false,
  model: false,
  year: false,
  mileage: false,
  trim: false,
  accidentType: false,
  details: false,
  situation: false,
  interests: false,
  question: false,
  insuranceSettlement: false,
  minBudget: false,
  maxBudget: false,
}

export const IntakeContext = createContext<IntakeContextValue | null>(null)

export function useIntakeDraft() {
  const context = useContext(IntakeContext)
  if (!context) {
    throw new Error('useIntakeDraft must be used within IntakeProvider')
  }
  return context
}
