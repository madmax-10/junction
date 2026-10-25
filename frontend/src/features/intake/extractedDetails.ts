import type { ExtractedDetail } from '../../types/extraction.ts'
import type { FieldConfirmation, IntakeDraft, SituationChanges } from '../../types/intake.ts'
import { formatMileage } from './intakeHighlights.ts'
import { accidentTypeOptions, getOptionLabel, situationOptions } from './intakeOptions.tsx'
import { getFieldValue } from './situationFields.ts'

const detailLabels: Record<ExtractedDetail['field'], string> = {
  make: 'Make',
  model: 'Model',
  year: 'Year',
  mileage: 'Mileage',
  accidentType: 'What happened',
  situation: 'Insurance',
}

export function getDetailLabel(detail: ExtractedDetail) {
  return detailLabels[detail.field]
}

function formatFieldValue(field: ExtractedDetail['field'], value: string) {
  switch (field) {
    case 'mileage':
      return `${formatMileage(value)} mi`
    case 'accidentType':
      return getOptionLabel(accidentTypeOptions, value) ?? value
    case 'situation':
      return getOptionLabel(situationOptions, value) ?? value
    default:
      return value
  }
}

export function formatDetailValue(detail: ExtractedDetail) {
  return formatFieldValue(detail.field, detail.value)
}

export function getDetailChanges(detail: ExtractedDetail): SituationChanges {
  switch (detail.field) {
    case 'accidentType':
      return { fields: { accidentType: detail.value } }
    case 'situation':
      return { fields: { situation: detail.value } }
    default:
      return { vehicle: { [detail.field]: detail.value } }
  }
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
