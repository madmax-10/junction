import type { StoryMatch, StoryPreview } from '../../types/story.ts'
import { accidentTypeOptions, getOptionLabel } from '../intake/intakeOptions.tsx'

export function toStoryPreview({ story, reasons }: StoryMatch): StoryPreview {
  const { year, make, model } = story.vehicle
  return {
    id: story.id,
    title: story.title,
    vehicle: `${year} ${make} ${model}`,
    accidentType: getOptionLabel(accidentTypeOptions, story.accident.type) ?? undefined,
    decision: story.decision.summary,
    outcome: story.outcome.summary,
    reportedAfter: story.outcome.reportedAfter,
    matchReasons: reasons,
  }
}
