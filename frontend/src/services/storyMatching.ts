import { matchSampleStories } from '../mocks/mockStoryMatcher.ts'
import type { StoryMatch, StoryMatchQuery } from '../types/story.ts'

// Backed by local sample stories for now; replace the body with the backend matching request.
export async function findSimilarStories(query: StoryMatchQuery): Promise<StoryMatch[]> {
  return matchSampleStories(query)
}
