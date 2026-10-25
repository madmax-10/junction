import type { IntakeDraft } from '../../types/intake.ts'
import { formatMileage, getVehicleName } from '../intake/intakeHighlights.ts'
import { accidentTypeOptions, getOptionLabel, situationOptions } from '../intake/intakeOptions.tsx'

export function hasVehicleDetails(draft: IntakeDraft) {
  const { make, model, year, mileage } = draft.vehicle
  return Boolean(make?.trim() && model?.trim() && year && mileage)
}

export function hasAccidentDetails(draft: IntakeDraft) {
  return draft.accidentType !== null || draft.details.trim().length > 0
}

export function hasStartingDetails(draft: IntakeDraft) {
  return hasVehicleDetails(draft) && hasAccidentDetails(draft)
}

export function buildStartingMessage(draft: IntakeDraft) {
  const vehicle = getVehicleName(draft.vehicle)
  const mileage = formatMileage(draft.vehicle.mileage)
  const accident = getOptionLabel(accidentTypeOptions, draft.accidentType)
  const insurance = getOptionLabel(situationOptions, draft.situation)
  const settlement = draft.insuranceSettlement.trim()
  return [
    `My car: ${vehicle}${mileage ? `, ${mileage} miles` : ''}.`,
    accident ? `What happened: ${accident}.` : null,
    draft.details.trim() || null,
    insurance ? `Insurance: ${insurance}.` : null,
    settlement ? `Insurance settlement: ${settlement}` : null,
    draft.question.trim() || 'What did people in a similar situation do?',
  ]
    .filter(Boolean)
    .join('\n')
}
