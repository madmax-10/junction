import type { ChatImage } from '../types/chat.ts'
import type { ExtractedDetail } from '../types/extraction.ts'
import type { AccidentType, CurrentSituation, IntakeDraft, LearningInterest } from '../types/intake.ts'
import { getFieldValue } from '../features/intake/situationFields.ts'
import { api } from './api.ts'

export type IssueType = 'buy' | 'sell' | 'repair'

export type SavedSituation = {
  usedCarId: string | null
  issues: Partial<Record<IssueType, string>>
  details: ExtractedDetail[]
}

type PersistedSituation = SavedSituation & { fingerprint: string }

const accidentLabels: Record<AccidentType, string> = {
  'rear-end': 'Rear-end collision',
  'front-collision': 'Front collision',
  'side-impact': 'Side impact',
  'weather-damage': 'Weather damage',
  other: 'Other damage',
}

const situationLabels: Record<CurrentSituation, string> = {
  'repair-estimate': 'Looking at a repair estimate',
  'total-loss': 'The car may be a total loss',
  'figuring-out': 'Still figuring out what to do',
}

export const emptySavedSituation: SavedSituation = { usedCarId: null, issues: {}, details: [] }

let current: PersistedSituation = { ...emptySavedSituation, issues: {}, fingerprint: '' }
let queue: Promise<void> = Promise.resolve()

export function resetPersistedSituation() {
  current = { ...emptySavedSituation, issues: {}, fingerprint: '' }
  queue = Promise.resolve()
}

function publicSaved(saved: PersistedSituation): SavedSituation {
  return { usedCarId: saved.usedCarId, issues: { ...saved.issues }, details: saved.details }
}

function digits(value: string) {
  return value.replace(/[^\d]/g, '')
}

function money(value: string) {
  const cleaned = value.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const amount = Number(cleaned)
  if (!Number.isFinite(amount) || amount < 0) return null
  return amount.toFixed(2)
}

function readyVehicle(draft: IntakeDraft) {
  const make = draft.vehicle.make?.trim() ?? ''
  const model = draft.vehicle.model?.trim() ?? ''
  const year = Number(draft.vehicle.year)
  const mileage = Number(digits(draft.vehicle.mileage))
  if (!make || !model || !Number.isInteger(year) || !Number.isInteger(mileage)) return null
  return { make, model, year, mileage, trim: draft.vehicle.trim.trim() }
}

function describe(draft: IntakeDraft) {
  const parts: string[] = []
  if (draft.accidentType) parts.push(accidentLabels[draft.accidentType])
  if (draft.situation) parts.push(situationLabels[draft.situation])
  if (draft.details.trim()) parts.push(draft.details.trim())
  if (draft.question.trim()) parts.push(draft.question.trim())
  if (draft.insuranceSettlement.trim()) parts.push(`Insurance settlement: ${draft.insuranceSettlement.trim()}`)
  return parts.join('\n\n') || 'Following up after a car accident.'
}

function wantedIssues(draft: IntakeDraft): IssueType[] {
  const interests = new Set<LearningInterest>(draft.interests)
  const types: IssueType[] = []
  if (interests.has('repair') || draft.situation === 'repair-estimate') types.push('repair')
  if (interests.has('sell')) types.push('sell')
  if (interests.has('buy')) types.push('buy')
  return types
}

function sameValue(field: ExtractedDetail['field'], currentValue: string, nextValue: string) {
  if (field === 'mileage') return digits(currentValue) === digits(nextValue)
  if (field === 'minBudget' || field === 'maxBudget') {
    return Number(currentValue.replace(/[$,\s]/g, '')) === Number(nextValue)
  }
  return currentValue.localeCompare(nextValue, undefined, { sensitivity: 'accent' }) === 0
}

function addMissing(details: ExtractedDetail[], draft: IntakeDraft, field: ExtractedDetail['field'], value: string | number | null) {
  if (value === null || value === '') return
  const nextValue = String(value)
  const existing = getFieldValue(draft, field)
  if (typeof existing === 'string' && existing.trim() && sameValue(field, existing, nextValue)) return
  details.push({ field, value: nextValue, evidence: 'Saved on your record' })
}

function preferences(draft: IntakeDraft) {
  const make = draft.vehicle.make?.trim() ?? ''
  const model = draft.vehicle.model?.trim() ?? ''
  const year = Number(draft.vehicle.year)
  const prefs: Record<string, unknown> = {}
  if (make) prefs.preferred_makes = [make]
  if (model) prefs.preferred_models = [model]
  if (draft.vehicle.year && Number.isInteger(year)) prefs.minimum_year = year
  return Object.keys(prefs).length > 0 ? prefs : null
}

async function upsertCar(draft: IntakeDraft, id: string | null) {
  const vehicle = readyVehicle(draft)
  if (!vehicle) return id
  const body = { ...vehicle, condition: '' }
  if (id) {
    await api(`/api/cars/used/${id}/`, { method: 'PATCH', body })
    return id
  }
  const created = await api<{ id: string }>('/api/cars/used/', { method: 'POST', body })
  return created.id
}

async function upsertIssue(draft: IntakeDraft, type: IssueType, id: string | undefined, usedCarId: string | null) {
  const description = describe(draft)
  if (type === 'buy') {
    const body: Record<string, unknown> = {
      description,
      min_budget: money(draft.minBudget),
      max_budget: money(draft.maxBudget),
    }
    const prefs = preferences(draft)
    if (prefs) body.preferences = prefs
    if (!id) {
      if (body.min_budget === null) delete body.min_budget
      if (body.max_budget === null) delete body.max_budget
    }
    const saved = await api<{ id: string }>(id ? `/api/issues/buy/${id}/` : '/api/issues/buy/', {
      method: id ? 'PATCH' : 'POST',
      body,
    })
    return saved.id
  }
  if (!usedCarId) return id ?? null
  if (type === 'sell') {
    const saved = await api<{ id: string }>(id ? `/api/issues/sell/${id}/` : '/api/issues/sell/', {
      method: id ? 'PATCH' : 'POST',
      body: { used_car: usedCarId, description, known_damage: draft.details.trim() },
    })
    return saved.id
  }
  const symptom = draft.details.trim().slice(0, 300)
  const saved = await api<{ id: string }>(id ? `/api/issues/repair/${id}/` : '/api/issues/repair/', {
    method: id ? 'PATCH' : 'POST',
    body: {
      used_car: usedCarId,
      description,
      ...(symptom ? { symptoms: { confirmed: [symptom] } } : {}),
    },
  })
  return saved.id
}

function detailsFrom(draft: IntakeDraft, usedCarId: string | null) {
  const details: ExtractedDetail[] = []
  const vehicle = usedCarId ? readyVehicle(draft) : null
  if (vehicle) {
    addMissing(details, draft, 'make', vehicle.make)
    addMissing(details, draft, 'model', vehicle.model)
    addMissing(details, draft, 'year', vehicle.year)
    addMissing(details, draft, 'trim', vehicle.trim)
    addMissing(details, draft, 'mileage', vehicle.mileage)
  }
  if (draft.interests.includes('buy')) {
    addMissing(details, draft, 'minBudget', money(draft.minBudget))
    addMissing(details, draft, 'maxBudget', money(draft.maxBudget))
  }
  return details
}

async function writeSituation(draft: IntakeDraft) {
  const next: PersistedSituation = {
    usedCarId: current.usedCarId,
    issues: { ...current.issues },
    details: [],
    fingerprint: '',
  }
  next.usedCarId = await upsertCar(draft, next.usedCarId)
  current = { ...next, fingerprint: current.fingerprint }
  for (const type of wantedIssues(draft)) {
    const id = await upsertIssue(draft, type, next.issues[type], next.usedCarId)
    if (id) next.issues[type] = id
    current = { ...next, issues: { ...next.issues }, fingerprint: current.fingerprint }
  }
  next.details = detailsFrom(draft, next.usedCarId)
  next.fingerprint = JSON.stringify(draft)
  current = next
  return next
}

export function syncSituation(draft: IntakeDraft) {
  const fingerprint = JSON.stringify(draft)
  const job = queue.then(async () => {
    if (current.fingerprint === fingerprint) return publicSaved(current)
    return publicSaved(await writeSituation(draft))
  })
  queue = job.then(
    () => undefined,
    () => undefined,
  )
  return job
}

export function photoTarget(saved: SavedSituation): { type: 'repair' | 'sell'; id: string } | null {
  if (saved.issues.repair) return { type: 'repair', id: saved.issues.repair }
  if (saved.issues.sell) return { type: 'sell', id: saved.issues.sell }
  return null
}

export async function uploadIssuePhotos(issue: { type: 'repair' | 'sell'; id: string }, images: ChatImage[]) {
  for (const image of images) {
    const blob = await fetch(image.url).then((response) => response.blob())
    const file = new File([blob], image.filename || 'photo.jpg', { type: blob.type || 'image/jpeg' })
    const formData = new FormData()
    formData.append('file', file)
    await api(`/api/issues/${issue.type}/${issue.id}/photos/`, { method: 'POST', formData })
  }
}
