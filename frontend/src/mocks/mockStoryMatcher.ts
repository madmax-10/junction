import type { IntakeDraft } from '../types/intake.ts'
import type { CommunityStory, StoryMatch, StoryMatchQuery } from '../types/story.ts'
import { communityStories } from './communityExperiences.ts'

// Scores published repair posts from shared vehicle fields and symptom words.
// A make or model match can stand on its own. Mileage or year alone cannot.

const reasonLimit = 3
const minimumScore = 2

function symptomText(story: CommunityStory) {
  const { confirmed = [], inferred = [] } = story.post_data.symptoms
  return [...confirmed, ...inferred]
}

function words(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3)
}

function sameText(left: string | null, right: string) {
  return left !== null && left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
}

function scoreStory(story: CommunityStory, draft: IntakeDraft, message: string): StoryMatch | null {
  const data = story.post_data
  const reasons: string[] = []
  let score = 0
  const { make, model, year, mileage } = draft.vehicle

  if (sameText(make, data.make)) {
    score += 3
    reasons.push(`Same make, ${data.make}`)
  }
  if (sameText(model, data.model)) {
    score += 3
    reasons.push(`Same model, ${data.model}`)
  }

  const yearNumber = Number(year)
  if (Number.isFinite(yearNumber) && Math.abs(yearNumber - data.year) <= 3) {
    score += 2
    reasons.push(`Similar year, ${data.year}`)
  }

  const mileageNumber = Number(mileage.replace(/,/g, ''))
  if (Number.isFinite(mileageNumber) && mileageNumber > 0 && Math.abs(mileageNumber - data.mileage) <= 40000) {
    score += 1
    reasons.push(`Similar mileage, ${data.mileage.toLocaleString('en-US')} mi`)
  }

  const haystack = new Set(words(`${message} ${draft.details}`))
  const shared = symptomText(story).find((symptom) => words(symptom).some((word) => haystack.has(word)))
  if (shared) {
    score += 2
    reasons.push(`Similar symptom, ${shared}`)
  }

  if (score < minimumScore) return null
  return { story, score, reasons: reasons.slice(0, reasonLimit) }
}

export function matchSampleStories({ message, situation, limit }: StoryMatchQuery): StoryMatch[] {
  return communityStories
    .map((story) => scoreStory(story, situation, message))
    .filter((match): match is StoryMatch => match !== null)
    .sort((left, right) => right.score - left.score || left.story.id.localeCompare(right.story.id))
    .slice(0, limit)
}
