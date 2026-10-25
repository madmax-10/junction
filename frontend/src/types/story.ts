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
  isSample: boolean
}

export type SampleSituation = {
  description: string
  isSample: boolean
}

export type StoryDecision = Exclude<LearningInterest, 'not-sure'>

export type DamageArea = 'front-end' | 'hood' | 'rear' | 'side' | 'roof' | 'frame' | 'airbags'

export type DamageSeverity = 'minor' | 'moderate' | 'severe'

export type ClaimPath = 'other-driver' | 'own-policy'

export type CommunityStory = {
  id: string
  title: string
  vehicle: { year: number; make: string; model: string; mileage: number }
  accident: {
    type: Exclude<AccidentType, 'other'>
    damage: DamageArea[]
    severity: DamageSeverity
  }
  claim: { path: ClaimPath; status: Exclude<CurrentSituation, 'figuring-out'> }
  decision: { kind: StoryDecision; summary: string }
  outcome: { summary: string; reportedAfter: string }
  isSample: boolean
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
