import type { StoryPreview } from '../types/story.ts'
import { sampleStoryPreviews } from './sampleStories.ts'

// Synthetic demo content. These are not real people or real outcomes.

const [rearEndRedLight, stopAndGo, totalLossCorolla] = sampleStoryPreviews

const frameDamageRepair: StoryPreview = {
  id: 'sample-frame-damage-repair',
  title: 'Frame damage after a side impact',
  vehicle: '2017 Subaru Outback',
  decision: 'Repaired it at a certified shop',
  outcome: 'Drives straight, disclosed the history when selling later',
  matchReasons: ['Major repair', 'Body shop estimate'],
  isSample: true,
}

const negotiatedPayout: StoryPreview = {
  id: 'sample-negotiated-payout',
  title: 'Pushed back on a total loss offer',
  vehicle: '2016 Ford Escape',
  decision: 'Sent the insurer local listings for the same model',
  outcome: 'Payout went up by about $1,400',
  matchReasons: ['Total loss', 'Insurer negotiation'],
  isSample: true,
}

const keptTotaledCar: StoryPreview = {
  id: 'sample-kept-totaled-car',
  title: 'Kept the car after it was totaled',
  vehicle: '2012 Toyota Camry',
  decision: 'Took a lower payout and kept the car',
  outcome: 'Fixed it at an independent shop for less',
  matchReasons: ['Total loss', 'Older sedan'],
  isSample: true,
}

const soldAsIs: StoryPreview = {
  id: 'sample-sold-as-is',
  title: 'Sold a damaged car as-is',
  vehicle: '2015 Nissan Altima',
  decision: 'Collected three dealer offers in one day',
  outcome: 'Took the highest and skipped the repair',
  matchReasons: ['Selling damaged car', 'Front-end damage'],
  isSample: true,
}

const privateSale: StoryPreview = {
  id: 'sample-private-sale',
  title: 'Fixed the cosmetics, then sold privately',
  vehicle: '2018 Hyundai Elantra',
  decision: 'Paid for a bumper repair before listing',
  outcome: 'Sold in two weeks for more than trade-in offers',
  matchReasons: ['Selling damaged car', 'Minor damage'],
  isSample: true,
}

const adjusterInWriting: StoryPreview = {
  id: 'sample-adjuster-in-writing',
  title: 'Asked the adjuster for everything in writing',
  vehicle: '2020 Kia Forte',
  decision: 'Requested the full valuation report',
  outcome: 'Found two errors in the comparable cars',
  matchReasons: ['Insurance claim', 'Adjuster valuation'],
  isSample: true,
}

const hailRepair: StoryPreview = {
  id: 'sample-hail-repair',
  title: 'Hail dents across the roof and hood',
  vehicle: '2019 Toyota RAV4',
  decision: 'Paintless dent repair through the claim',
  outcome: 'Done in four days, no repainting needed',
  matchReasons: ['Weather damage', 'Hail'],
  isSample: true,
}

const floodTotalLoss: StoryPreview = {
  id: 'sample-flood-total-loss',
  title: 'Water reached the seats during a flood',
  vehicle: '2014 Honda Accord',
  decision: 'Accepted the insurer’s total loss',
  outcome: 'Put the payout toward a certified used car',
  matchReasons: ['Weather damage', 'Total loss'],
  isSample: true,
}

export const chatTopics = ['repair', 'total-loss', 'sell', 'insurance', 'weather', 'general'] as const
export type ChatTopic = (typeof chatTopics)[number]

export const experiencesByTopic: Record<ChatTopic, StoryPreview[]> = {
  repair: [rearEndRedLight, frameDamageRepair, stopAndGo],
  'total-loss': [negotiatedPayout, totalLossCorolla, keptTotaledCar],
  sell: [soldAsIs, privateSale, keptTotaledCar],
  insurance: [adjusterInWriting, stopAndGo, negotiatedPayout],
  weather: [hailRepair, floodTotalLoss, adjusterInWriting],
  general: [rearEndRedLight, totalLossCorolla, soldAsIs],
}
