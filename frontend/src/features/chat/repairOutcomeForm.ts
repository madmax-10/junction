import type { RepairOutcomeStatus, RepairResolution } from '../../types/repair.ts'

export type RepairOutcomeForm = {
  status: RepairOutcomeStatus
  method: 'mechanic' | 'self'
  workPerformed: string
  instructions: string
  partsUsed: string
  cost: string
  mechanicName: string
  location: string
  insuranceSettlement: string
  nameMechanic: boolean
}

export type RepairOutcomeErrors = Partial<Record<keyof RepairOutcomeForm, string>>

// Limits match normalize_resolution_details in backend/common/validators.py.
export const outcomeLimits = {
  workPerformed: 1000,
  instructions: 2000,
  mechanicName: 100,
  location: 255,
  insuranceSettlement: 500,
} as const

export function toOutcomeForm(status: RepairOutcomeStatus | undefined, resolution: Partial<RepairResolution> | undefined): RepairOutcomeForm {
  return {
    status: status ?? 'resolved',
    method: resolution?.method ?? 'mechanic',
    workPerformed: resolution?.work_performed ?? '',
    instructions: resolution?.instructions ?? '',
    partsUsed: resolution?.parts_used?.join(', ') ?? '',
    cost: resolution?.cost === undefined ? '' : String(resolution.cost),
    mechanicName: resolution?.mechanic_name ?? '',
    location: resolution?.location ?? '',
    insuranceSettlement: resolution?.insurance_settlement ?? '',
    nameMechanic: Boolean(resolution?.mechanic_name),
  }
}

function limited(errors: RepairOutcomeErrors, key: keyof typeof outcomeLimits, value: string) {
  if (value.length > outcomeLimits[key]) errors[key] = `Use ${outcomeLimits[key]} characters or fewer.`
}

export function fromOutcomeForm(form: RepairOutcomeForm) {
  const errors: RepairOutcomeErrors = {}
  const resolution: RepairResolution = { method: form.method }

  if (form.method === 'mechanic') {
    const work = form.workPerformed.trim()
    const name = form.mechanicName.trim()
    const location = form.location.trim()
    if (!work) errors.workPerformed = 'Describe the work that was done.'
    limited(errors, 'workPerformed', work)
    limited(errors, 'mechanicName', name)
    limited(errors, 'location', location)
    if (work) resolution.work_performed = work
    if (name) resolution.mechanic_name = name
    if (location) resolution.location = location
  } else {
    const steps = form.instructions.trim()
    if (!steps) errors.instructions = 'Describe what you did.'
    limited(errors, 'instructions', steps)
    if (steps) resolution.instructions = steps
    const parts = form.partsUsed.split(',').map((part) => part.trim()).filter(Boolean)
    if (parts.length > 20) errors.partsUsed = 'List 20 parts or fewer.'
    else if (parts.some((part) => part.length > 100)) errors.partsUsed = 'Keep each part to 100 characters.'
    else if (parts.length > 0) resolution.parts_used = parts
  }

  const cost = form.cost.replace(/[$,\s]/g, '')
  if (cost) {
    if (!/^\d+(\.\d{1,2})?$/.test(cost)) errors.cost = 'Enter an amount like 250 or 180.50.'
    else resolution.cost = Number(cost)
  }
  const settlement = form.insuranceSettlement.trim()
  limited(errors, 'insuranceSettlement', settlement)
  if (settlement) resolution.insurance_settlement = settlement

  return { resolution, errors, isValid: Object.keys(errors).length === 0 }
}
