import type {
  FieldConfirmation,
  IntakeDraft,
  SectionStatus,
  SituationField,
  SituationSection,
  VehicleInfo,
} from '../../types/intake.ts'

export const fieldsBySection: Record<SituationSection, SituationField[]> = {
  vehicle: ['make', 'model', 'year', 'mileage', 'trim'],
  accident: ['accidentType', 'details'],
  insurance: ['situation', 'insuranceSettlement'],
  concerns: ['interests', 'question', 'minBudget', 'maxBudget'],
}

function isVehicleField(field: SituationField): field is keyof VehicleInfo {
  return fieldsBySection.vehicle.includes(field)
}

export function getFieldValue(draft: IntakeDraft, field: SituationField) {
  return isVehicleField(field) ? draft.vehicle[field] : draft[field]
}

export function hasFieldValue(draft: IntakeDraft, field: SituationField) {
  const value = getFieldValue(draft, field)
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'string' ? value.trim().length > 0 : value !== null
}

// A section is confirmed only when every field the user has filled in was explicitly confirmed.
export function getSectionStatus(
  draft: IntakeDraft,
  confirmed: FieldConfirmation,
  section: SituationSection,
): SectionStatus {
  const filledFields = fieldsBySection[section].filter((field) => hasFieldValue(draft, field))
  if (filledFields.length === 0) return 'missing'
  return filledFields.every((field) => confirmed[field]) ? 'confirmed' : 'unconfirmed'
}
