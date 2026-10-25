import { communityStories } from '../mocks/communityExperiences.ts'
import type { CommunityStory } from '../types/story.ts'

// Backed by local sample stories for now; replace the body with the backend stories request.
export async function getCommunityStories(): Promise<CommunityStory[]> {
  return communityStories
}
