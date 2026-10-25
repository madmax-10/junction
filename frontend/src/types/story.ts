import type { AccidentType, CurrentSituation, IntakeDraft, LearningInterest } from './intake.ts'

export type StoryPreview = {
  id: string
  title: string
  vehicle: string
  accidentType?: string
  decision: string
  outcome: string
  reportedAfter?: string
  matchReasons: string[]
}

export type SampleSituation = {
  description: string
}

export type StoryDecision = Exclude<LearningInterest, 'not-sure'>

export type DamageArea = 'front-end' | 'hood' | 'rear' | 'side' | 'roof' | 'frame' | 'airbags'

export type DamageSeverity = 'minor' | 'moderate' | 'severe'

export type ClaimPath = 'other-driver' | 'own-policy'

export type StoryChoice = 'repair' | 'sell' | 'replace' | 'undecided'

export type StoryStatus = 'ongoing' | 'resolved'

export type BodyStyle = 'sedan' | 'suv' | 'truck'

export type StoryCost = { label: string; amount: number }

export type CommunityStory = {
  id: string
  title: string
  owner: { location: string }
  vehicle: { year: number; make: string; model: string; mileage: number; bodyStyle: BodyStyle }
  accident: {
    type: Exclude<AccidentType, 'other'>
    damage: DamageArea[]
    severity: DamageSeverity
  }
  claim: { path: ClaimPath; status: Exclude<CurrentSituation, 'figuring-out'> }
  narrative: string
  decision: { choice: StoryChoice; summary: string }
  // The learning interests this experience speaks to, used when matching it to a user.
  topics: StoryDecision[]
  outcome: { summary: string; reportedAfter: string; costs: StoryCost[] }
  lessons: string[]
  status: StoryStatus
}

export type StoryFilters = {
  query: string
  choice: StoryChoice | null
  bodyStyle: BodyStyle | null
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
