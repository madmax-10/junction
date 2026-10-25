import type { CommunityStory, StoryChoice, StoryFilters } from '../../types/story.ts'
import { accidentTypeOptions, getOptionLabel } from '../intake/intakeOptions.tsx'
import { getChoiceOption } from './storyOptions.tsx'

export const emptyStoryFilters: StoryFilters = { query: '', choice: null, bodyStyle: null }

export function getVehicleName({ vehicle }: CommunityStory) {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`
}

export function getAccidentLabel(story: CommunityStory) {
  return getOptionLabel(accidentTypeOptions, story.accident.type)
}

function normalize(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/[’']/g, '')
}

function getSearchText(story: CommunityStory) {
  return normalize(
    [
      story.title,
      story.owner.location,
      getVehicleName(story),
      getAccidentLabel(story),
      getChoiceOption(story.decision.choice).label,
      story.narrative,
      story.decision.summary,
      story.outcome.summary,
      ...story.lessons,
    ].join(' '),
  )
}

function matchesQuery(story: CommunityStory, query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const text = getSearchText(story)
  return terms.every((term) => text.includes(term))
}

export function hasActiveFilters({ query, choice, bodyStyle }: StoryFilters) {
  return query.trim() !== '' || choice !== null || bodyStyle !== null
}

export function filterStories(stories: CommunityStory[], { query, choice, bodyStyle }: StoryFilters) {
  return stories.filter(
    (story) =>
      (choice === null || story.decision.choice === choice) &&
      (bodyStyle === null || story.vehicle.bodyStyle === bodyStyle) &&
      matchesQuery(story, query),
  )
}

// Counts for each decision within the other active filters, so the chips preview their result.
export function countByChoice(stories: CommunityStory[], filters: StoryFilters) {
  const counts: Record<StoryChoice, number> = { repair: 0, sell: 0, replace: 0, undecided: 0 }
  for (const story of filterStories(stories, { ...filters, choice: null })) {
    counts[story.decision.choice] += 1
  }
  return counts
}
