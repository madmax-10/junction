import type { StoryMatch, StoryPreview } from '../../types/story.ts'
import { getVehicleName } from './storyFilters.ts'
import { getMethodOption } from './storyOptions.tsx'

export function toStoryPreview({ story, reasons }: StoryMatch): StoryPreview {
  const method = story.post_data.method ? getMethodOption(story.post_data.method) : null
  const decision = method
    ? story.post_data.mechanic_name
      ? `${method.label} · ${story.post_data.mechanic_name}`
      : method.label
    : 'No repair decision reported'
  return {
    id: story.id,
    title: story.title,
    vehicle: getVehicleName(story),
    decision,
    outcome: story.post_data.work_performed || 'No outcome reported yet',
    reportedAfter: story.post_data.insurance_settlement || undefined,
    matchReasons: reasons,
  }
}
