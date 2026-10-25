import type { ExtractedDetail } from '../../types/extraction.ts'
import type { FieldConfirmation, IntakeDraft, SituationChanges } from '../../types/intake.ts'
import { formatPrice } from '../marketplace/marketplaceOptions.tsx'
import { formatMileage } from './intakeHighlights.ts'
import { getFieldValue } from './situationFields.ts'

const detailLabels: Record<ExtractedDetail['field'], string> = {
  make: 'Make',
  model: 'Model',
  year: 'Year',
  trim: 'Trim',
  mileage: 'Mileage',
  details: 'What happened',
  insuranceSettlement: 'Insurance settlement',
  minBudget: 'Minimum budget',
  maxBudget: 'Maximum budget',
}

const vehicleFields = new Set<ExtractedDetail['field']>(['make', 'model', 'year', 'trim', 'mileage'])

export function getDetailLabel(detail: ExtractedDetail) {
  return detailLabels[detail.field]
}

function formatFieldValue(field: ExtractedDetail['field'], value: string) {
  switch (field) {
    case 'mileage':
      return `${formatMileage(value)} mi`
    case 'minBudget':
    case 'maxBudget':
      return formatPrice(Number(value))
    default:
      return value
  }
}

export function formatDetailValue(detail: ExtractedDetail) {
  return formatFieldValue(detail.field, detail.value)
}

export function getDetailChanges(detail: ExtractedDetail): SituationChanges {
  if (vehicleFields.has(detail.field)) {
    return { vehicle: { [detail.field]: detail.value } }
  }
  return { fields: { [detail.field]: detail.value } }
}

function currentValue(detail: ExtractedDetail, draft: IntakeDraft) {
  const value = getFieldValue(draft, detail.field)
  return typeof value === 'string' && value.trim() ? value : null
}

function isSameValue(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
}

export function isDetailSaved(detail: ExtractedDetail, draft: IntakeDraft, confirmed: FieldConfirmation) {
  const current = currentValue(detail, draft)
  return current !== null && isSameValue(current, detail.value) && confirmed[detail.field]
}

export function getReplacedValue(detail: ExtractedDetail, draft: IntakeDraft) {
  const current = currentValue(detail, draft)
  return current && !isSameValue(current, detail.value) ? formatFieldValue(detail.field, current) : null
}
