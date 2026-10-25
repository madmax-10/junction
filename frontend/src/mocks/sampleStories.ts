import type { SampleSituation, StoryPreview } from '../types/story.ts'

// Synthetic demo content. These are not real people or real outcomes.

export const sampleSituation: SampleSituation = {
  description:
    'Rear-ended at a red light. The bumper and trunk are damaged, and the other driver’s insurer already called.',
}

export const sampleStoryPreviews: StoryPreview[] = [
  {
    id: 'rear-end-red-light',
    title: 'Bumper cover and trunk latch repaired',
    vehicle: '2019 Honda Civic',
    decision: 'Mechanic · Austin Body Shop',
    outcome: 'Replaced the bumper cover and trunk latch. The reverse sensor works again.',
    reportedAfter: 'The other driver’s insurer paid the $4,600 repair.',
    matchReasons: ['Same make, Honda', 'Similar symptom, Trunk will not close'],
  },
  {
    id: 'stop-and-go',
    title: 'Tailgate and rear lights replaced at home',
    vehicle: '2018 Ford F-150',
    decision: 'Self repair',
    outcome: 'Replaced the tailgate skin and the passenger rear light in the driveway.',
    reportedAfter: 'I paid for the parts and did not file a claim.',
    matchReasons: ['Similar symptom, Cracked tailgate'],
  },
  {
    id: 'side-impact-frame',
    title: 'Driver-side doors and pillar repaired',
    vehicle: '2017 Subaru Outback',
    decision: 'Mechanic · Houston Frame & Body',
    outcome: 'Replaced both driver-side doors and pulled the pillar back into spec.',
    reportedAfter: 'My own policy covered the repair after a $500 deductible.',
    matchReasons: ['Similar year, 2017'],
  },
]
