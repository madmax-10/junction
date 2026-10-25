import type { CommunityStory } from '../types/story.ts'

// Synthetic demo content. These are not real people or real outcomes.

export const communityStories: CommunityStory[] = [
  {
    id: 'sample-rear-end-red-light',
    title: 'Rear-ended at a red light',
    vehicle: { year: 2019, make: 'Honda', model: 'Civic', mileage: 42_000 },
    accident: { type: 'rear-end', damage: ['rear'], severity: 'moderate' },
    claim: { path: 'other-driver', status: 'repair-estimate' },
    decision: {
      kind: 'repaired',
      summary: 'Had the $4,600 repair done through the other driver’s insurer',
    },
    outcome: {
      summary: 'Back on the road in three weeks, with the rental covered',
      reportedAfter: '2 months later',
    },
    isSample: true,
  },
  {
    id: 'sample-total-loss-corolla',
    title: 'Rear bumper and trunk crushed',
    vehicle: { year: 2014, make: 'Toyota', model: 'Corolla', mileage: 148_000 },
    accident: { type: 'rear-end', damage: ['rear', 'frame'], severity: 'severe' },
    claim: { path: 'other-driver', status: 'total-loss' },
    decision: {
      kind: 'replaced',
      summary: 'Accepted the total loss and bought a used sedan',
    },
    outcome: {
      summary: 'The $7,900 payout covered most of a similar used car',
      reportedAfter: '3 months later',
    },
    isSample: true,
  },
  {
    id: 'sample-side-impact-frame',
    title: 'T-boned at an intersection',
    vehicle: { year: 2017, make: 'Subaru', model: 'Outback', mileage: 88_000 },
    accident: { type: 'side-impact', damage: ['side', 'frame'], severity: 'severe' },
    claim: { path: 'own-policy', status: 'repair-estimate' },
    decision: {
      kind: 'repaired',
      summary: 'Had the frame repaired at a certified shop',
    },
    outcome: {
      summary: 'Took six weeks and drives straight, but a later trade-in offer came in low',
      reportedAfter: '1 year later',
    },
    isSample: true,
  },
  {
    id: 'sample-negotiated-payout',
    title: 'Pushed back on a total loss offer',
    vehicle: { year: 2016, make: 'Ford', model: 'Escape', mileage: 97_000 },
    accident: { type: 'front-collision', damage: ['front-end', 'hood', 'airbags'], severity: 'severe' },
    claim: { path: 'own-policy', status: 'total-loss' },
    decision: {
      kind: 'insurance-settlement',
      summary: 'Sent the insurer listings for similar Escapes nearby',
    },
    outcome: {
      summary: 'The payout rose by about $1,400 after two weeks',
      reportedAfter: '1 month later',
    },
    isSample: true,
  },
  {
    id: 'sample-sold-as-is',
    title: 'Sold a damaged car as-is',
    vehicle: { year: 2015, make: 'Nissan', model: 'Altima', mileage: 112_000 },
    accident: { type: 'front-collision', damage: ['front-end', 'hood'], severity: 'moderate' },
    claim: { path: 'own-policy', status: 'repair-estimate' },
    decision: {
      kind: 'sold',
      summary: 'Sold it as-is instead of paying for the $5,800 repair',
    },
    outcome: {
      summary: 'Took the best of three dealer offers, $3,200, the same day',
      reportedAfter: '2 weeks later',
    },
    isSample: true,
  },
  {
    id: 'sample-hail-roof',
    title: 'Hail dents across the roof and hood',
    vehicle: { year: 2019, make: 'Toyota', model: 'RAV4', mileage: 51_000 },
    accident: { type: 'weather-damage', damage: ['roof', 'hood'], severity: 'minor' },
    claim: { path: 'own-policy', status: 'repair-estimate' },
    decision: {
      kind: 'repaired',
      summary: 'Chose paintless dent repair through the claim',
    },
    outcome: {
      summary: 'Done in four days with no repainting, after the deductible',
      reportedAfter: '3 months later',
    },
    isSample: true,
  },
]
