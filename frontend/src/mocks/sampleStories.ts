import type { SampleSituation, StoryPreview } from '../types/story.ts'

// Synthetic demo content. These are not real people or real outcomes.

export const sampleSituation: SampleSituation = {
  description:
    'Rear-ended at a red light. My bumper and trunk are damaged, and the other driver’s insurer already called.',
}

export const sampleStoryPreviews: StoryPreview[] = [
  {
    id: 'rear-end-red-light',
    title: 'Rear-ended at a red light',
    vehicle: '2019 Honda Civic',
    decision: 'Repaired through the other driver’s insurance',
    outcome: 'Back on the road in three weeks, rental covered',
    matchReasons: ['Rear-end collision', 'Other driver’s insurer'],
  },
  {
    id: 'stop-and-go',
    title: 'Hit from behind in stop-and-go traffic',
    vehicle: '2018 Mazda3',
    decision: 'Got two repair estimates first',
    outcome: 'The insurer raised its first offer to match',
    matchReasons: ['Rear-end collision', 'Trunk damage'],
  },
  {
    id: 'total-loss',
    title: 'Rear bumper and trunk crushed',
    vehicle: '2014 Toyota Corolla',
    decision: 'Accepted the total loss',
    outcome: 'The payout covered most of a similar used car',
    matchReasons: ['Similar damage', 'Older sedan'],
  },
]
