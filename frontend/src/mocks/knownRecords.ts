import type { ExtractedDetail } from '../types/extraction.ts'

export type KnownIds = {
  usedCarId: string | null
  issue: { type: 'buy' | 'sell' | 'repair'; id: string } | null
  postId: string | null
}

const repairIssueId = 'a11e0000-0000-4000-8000-000000000001'
const buyIssueId = 'a11e0000-0000-4000-8000-000000000010'
const usedCarId = '6f1c2a40-7b1e-4c1a-9a11-0b1c2d3e4f50'
const postId = 'b2c3d4e5-f6a7-8901-bcde-f12345678901'

// Ids already produced for this session. Extraction reads these records and nothing else.
export const knownIds: KnownIds = {
  usedCarId,
  issue: { type: 'repair', id: repairIssueId },
  postId,
}

export const knownIssuePhoto = {
  type: 'repair' as const,
  id: repairIssueId,
  existingCount: 0,
}

type KnownCar = { make: string; model: string; year: number; trim: string; mileage: number }
type KnownIssue = {
  type: 'buy' | 'sell' | 'repair'
  symptoms?: { confirmed?: string[] }
  insuranceSettlement?: string
  minBudget?: number
  maxBudget?: number
}

const cars: Record<string, KnownCar> = {
  [usedCarId]: { make: 'Honda', model: 'Civic', year: 2019, trim: 'EX', mileage: 42000 },
}

const issues: Record<string, KnownIssue> = {
  [repairIssueId]: {
    type: 'repair',
    symptoms: { confirmed: ['Trunk will not close', 'Reverse sensor stopped'] },
    insuranceSettlement: "The other driver's insurer paid the $4,600 repair.",
  },
  [buyIssueId]: {
    type: 'buy',
    minBudget: 8000,
    maxBudget: 15000,
  },
}

const posts: Record<string, { make?: string; model?: string; year?: number; trim?: string; mileage?: number; insuranceSettlement?: string }> = {
  [postId]: {
    make: 'Honda',
    model: 'Civic',
    year: 2019,
    trim: 'EX',
    mileage: 42000,
    insuranceSettlement: "The other driver's insurer paid the $4,600 repair.",
  },
}

const savedOnRecord = 'Saved on your record'

function add(
  details: ExtractedDetail[],
  field: ExtractedDetail['field'],
  value: string | number | null | undefined,
) {
  if (value === null || value === undefined || value === '') return
  details.push({ field, value: String(value), evidence: savedOnRecord })
}

export function extractFromKnownIds(ids: KnownIds): ExtractedDetail[] {
  if (!ids.usedCarId && !ids.issue && !ids.postId) return []

  const details: ExtractedDetail[] = []
  const car = ids.usedCarId ? cars[ids.usedCarId] : undefined
  const post = ids.postId ? posts[ids.postId] : undefined
  const issue = ids.issue ? issues[ids.issue.id] : undefined
  const vehicle = car ?? post

  if (vehicle) {
    add(details, 'make', vehicle.make)
    add(details, 'model', vehicle.model)
    add(details, 'year', vehicle.year)
    add(details, 'trim', vehicle.trim)
    add(details, 'mileage', vehicle.mileage)
  }

  const symptoms = issue?.symptoms?.confirmed?.filter(Boolean) ?? []
  if (symptoms.length > 0) add(details, 'details', symptoms.join('. '))

  add(details, 'insuranceSettlement', issue?.insuranceSettlement ?? post?.insuranceSettlement)
  if (issue?.type === 'buy') {
    add(details, 'minBudget', issue.minBudget)
    add(details, 'maxBudget', issue.maxBudget)
  }

  return details
}
