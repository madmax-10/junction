import type { IntakeDraft, VehicleInfo } from '../../types/intake.ts'
import { accidentTypeOptions, getOptionLabel, situationOptions } from './intakeOptions.tsx'

export function formatMileage(digits: string) {
  return digits ? Number(digits).toLocaleString('en-US') : ''
}

export function getVehicleName(vehicle: VehicleInfo) {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim.trim()].filter(Boolean).join(' ') || null
}

export function getIntakeHighlights(draft: IntakeDraft) {
  return [
    getOptionLabel(accidentTypeOptions, draft.accidentType),
    getOptionLabel(situationOptions, draft.situation),
    getVehicleName(draft.vehicle),
  ].filter((highlight): highlight is string => Boolean(highlight))
}
