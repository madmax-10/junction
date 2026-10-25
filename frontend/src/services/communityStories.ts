import { getRepairStories } from './posts.ts'
import type { CommunityStory } from '../types/story.ts'

export async function getCommunityStories(): Promise<CommunityStory[]> {
  return getRepairStories()
}
