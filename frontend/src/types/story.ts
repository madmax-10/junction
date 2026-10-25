import type { IntakeDraft } from './intake.ts'

export type RepairMethod = 'mechanic' | 'self'

export type RepairSymptoms = {
  confirmed?: string[]
  inferred?: string[]
}

// Money matches the backend: a JSON number rounded to cents. A whole dollar is an integer.
export type RepairPostData = {
  make: string
  model: string
  year: number
  trim: string
  mileage: number
  symptoms: RepairSymptoms
  method: RepairMethod
  work_performed: string
  cost: number | null
  mechanic_name: string
  owner_reported: true
  insurance_settlement: string
  photos: string[]
}

export type CommunityStory = {
  id: string
  issue_id: string
  issue_type: 'repair'
  title: string
  content: string
  post_data: RepairPostData
  status: 'published'
  approved_at: string
  created_at: string
  updated_at: string
}

export type StoryPriceBand = 'under-5k' | '5k-10k' | '10k-20k' | 'over-20k'

export type StoryFilters = {
  query: string
  yearMin: number | null
  price: StoryPriceBand | null
}

export type StoryMatchQuery = {
  message: string
  situation: IntakeDraft
  limit: number
}

export type StoryMatch = {
  story: CommunityStory
  score: number
  reasons: string[]
}

export type StoryMatchStatus = 'matched' | 'no-match' | 'unavailable'

export type StoryPreview = {
  id: string
  title: string
  vehicle: string
  decision: string
  outcome: string
  reportedAfter?: string
  matchReasons: string[]
}

export type SampleSituation = {
  description: string
}

export type StoryStatus = 'ongoing' | 'resolved'
