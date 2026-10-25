import type { ExperienceHighlight, SampleSituation, StoryPreview } from '../types/story.ts'

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

export const sampleExperiences: ExperienceHighlight[] = [
  {
    id: 'rear-end-red-light',
    vehicle: '2019 Honda Civic',
    category: 'Rear-end collision',
    situation: 'Rear-ended at a red light. The bumper was crushed and the trunk wouldn’t latch.',
    decision: 'Repaired at a local body shop through the other driver’s insurer.',
    outcome: 'Bumper cover and trunk latch replaced. The reverse sensor works again.',
    reported: '$4,600, paid by the other insurer',
  },
  {
    id: 'stop-and-go',
    vehicle: '2018 Ford F-150',
    category: 'Low-speed impact',
    situation: 'Tapped in stop-and-go traffic. Cracked tailgate and a dead rear light.',
    decision: 'Skipped the claim and fixed it at home with replacement parts.',
    outcome: 'Tailgate skin and passenger rear light replaced in the driveway.',
    reported: 'Parts only, no claim filed',
  },
  {
    id: 'side-impact-frame',
    vehicle: '2017 Subaru Outback',
    category: 'Side impact',
    situation: 'Hit on the driver’s side at an intersection. Both doors and the pillar were bent.',
    decision: 'Kept the car and repaired it under their own policy.',
    outcome: 'Both driver-side doors replaced and the pillar pulled back into spec.',
    reported: 'Covered after a $500 deductible',
  },
]
