import type { CommunityStory, StoryFilters, StoryPriceBand } from '../../types/story.ts'
import { priceOptions } from './storyOptions.tsx'

export const emptyStoryFilters: StoryFilters = { query: '', yearMin: null, price: null }

export function getVehicleName(story: CommunityStory) {
  const { year, make, model } = story.post_data
  return `${year} ${make} ${model}`
}

export function getSymptomLabel(story: CommunityStory) {
  return story.post_data.symptoms.confirmed?.[0] ?? story.post_data.symptoms.inferred?.[0] ?? null
}

function normalize(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/[’']/g, '')
}

function matchesQuery(story: CommunityStory, query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const { make, model, trim, symptoms } = story.post_data
  const text = normalize(
    [story.title, make, model, trim, ...(symptoms.confirmed ?? []), ...(symptoms.inferred ?? [])].join(' '),
  )
  return terms.every((term) => text.includes(term))
}

function matchesPrice(cost: number | null, price: StoryPriceBand | null) {
  if (price === null) return true
  if (cost === null) return false
  const range = priceOptions.find((option) => option.value === price)
  return !range || (cost >= range.min && cost < range.max)
}

export function hasActiveFilters({ query, yearMin, price }: StoryFilters) {
  return query.trim() !== '' || yearMin !== null || price !== null
}

export function filterStories(stories: CommunityStory[], { query, yearMin, price }: StoryFilters) {
  return stories.filter(
    (story) =>
      (yearMin === null || story.post_data.year >= yearMin) &&
      matchesPrice(story.post_data.cost, price) &&
      matchesQuery(story, query),
  )
}

export function countByPrice(stories: CommunityStory[], filters: StoryFilters) {
  const counts = Object.fromEntries(priceOptions.map((option) => [option.value, 0])) as Record<StoryPriceBand, number>
  for (const story of filterStories(stories, { ...filters, price: null })) {
    for (const option of priceOptions) {
      if (matchesPrice(story.post_data.cost, option.value)) {
        counts[option.value] += 1
      }
    }
  }
  return counts
}
