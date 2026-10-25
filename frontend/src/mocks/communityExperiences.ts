import type { CommunityStory } from '../types/story.ts'

// Synthetic demo content. These are not real people or real outcomes.

export const communityStories: CommunityStory[] = [
  {
    id: 'rear-end-red-light',
    title: 'Rear-ended at a red light',
    owner: { location: 'Austin, TX' },
    vehicle: { year: 2019, make: 'Honda', model: 'Civic', mileage: 42_000, bodyStyle: 'sedan' },
    accident: { type: 'rear-end', damage: ['rear'], severity: 'moderate' },
    claim: { path: 'other-driver', status: 'repair-estimate' },
    narrative:
      'I was stopped at a red light when a pickup rolled into the back of my Civic at around 15 mph. The bumper cover cracked, the trunk lid wouldn’t close all the way, and the reverse sensor stopped working. Nobody was hurt, and the other driver admitted fault on the spot.',
    decision: {
      choice: 'repair',
      summary: 'Had the $4,600 repair done through the other driver’s insurer',
    },
    topics: ['repaired'],
    outcome: {
      summary: 'Back on the road in three weeks, with the rental covered',
      reportedAfter: '2 months later',
      costs: [
        { label: 'Repair estimate', amount: 4_600 },
        { label: 'Out of pocket', amount: 0 },
      ],
    },
    lessons: [
      'I got the rental approval in writing before dropping the car off, which avoided a billing mix-up later.',
      'I didn’t have to use the insurer’s preferred shop, so I picked one nearby with strong reviews.',
      'The trunk seal leaked a little at first. The shop fixed it for free because I reported it within a week.',
    ],
    status: 'resolved',
  },
  {
    id: 'total-loss-corolla',
    title: 'Rear bumper and trunk crushed',
    owner: { location: 'San Antonio, TX' },
    vehicle: { year: 2014, make: 'Toyota', model: 'Corolla', mileage: 148_000, bodyStyle: 'sedan' },
    accident: { type: 'rear-end', damage: ['rear', 'frame'], severity: 'severe' },
    claim: { path: 'other-driver', status: 'total-loss' },
    narrative:
      'A distracted driver hit me from behind on the freeway. The impact pushed the trunk toward the back seat and bent the rear frame rails. With nearly 150,000 miles on the car, I wasn’t surprised when the adjuster called it a total loss.',
    decision: {
      choice: 'replace',
      summary: 'Accepted the total loss and bought a used sedan',
    },
    topics: ['replaced'],
    outcome: {
      summary: 'The $7,900 payout covered most of a similar used car',
      reportedAfter: '3 months later',
      costs: [
        { label: 'Insurance payout', amount: 7_900 },
        { label: 'Replacement car', amount: 9_400 },
        { label: 'Out of pocket', amount: 1_500 },
      ],
    },
    lessons: [
      'Asking how the payout was calculated, and seeing the comparable listings, helped me trust the number.',
      'I cleaned out the car right away. The tow yard moved it within days and my registration papers were still inside.',
      'The gap between the payout and a similar car was bigger than I expected, so I budgeted for it early.',
    ],
    status: 'resolved',
  },
  {
    id: 'side-impact-frame',
    title: 'T-boned at an intersection',
    owner: { location: 'Houston, TX' },
    vehicle: { year: 2017, make: 'Subaru', model: 'Outback', mileage: 88_000, bodyStyle: 'suv' },
    accident: { type: 'side-impact', damage: ['side', 'frame'], severity: 'severe' },
    claim: { path: 'own-policy', status: 'repair-estimate' },
    narrative:
      'Someone ran a stop sign and hit my driver’s side. Both doors and the pillar between them were pushed in, and the shop found the frame slightly out of spec. I went through my own insurance because the other driver’s company was slow to respond.',
    decision: {
      choice: 'repair',
      summary: 'Had the frame repaired at a certified shop',
    },
    topics: ['repaired'],
    outcome: {
      summary: 'Took six weeks and drives straight, but a later trade-in offer came in low',
      reportedAfter: '1 year later',
      costs: [
        { label: 'Repair total', amount: 11_200 },
        { label: 'My deductible', amount: 1_000 },
      ],
    },
    lessons: [
      'I asked for the post-repair frame measurement printout and kept it with my records.',
      'The repair showed up on the vehicle history report, and it did affect the trade-in offers I got.',
      'My insurer recovered my deductible from the other driver’s company, but it took about four months.',
    ],
    status: 'resolved',
  },
  {
    id: 'negotiated-payout',
    title: 'Pushed back on a total loss offer',
    owner: { location: 'Dallas, TX' },
    vehicle: { year: 2016, make: 'Ford', model: 'Escape', mileage: 97_000, bodyStyle: 'suv' },
    accident: { type: 'front-collision', damage: ['front-end', 'hood', 'airbags'], severity: 'severe' },
    claim: { path: 'own-policy', status: 'total-loss' },
    narrative:
      'A car pulled out in front of me and I couldn’t stop in time. Both front airbags deployed, the hood buckled, and the radiator was pushed back into the engine. My insurer declared it a total loss within a week, but the first offer felt low for the mileage and trim.',
    decision: {
      choice: 'replace',
      summary: 'Sent the insurer listings for similar Escapes nearby, then bought a used CR-V',
    },
    topics: ['insurance-settlement', 'replaced'],
    outcome: {
      summary: 'The payout rose by about $1,400 after two weeks',
      reportedAfter: '1 month later',
      costs: [
        { label: 'First offer', amount: 9_100 },
        { label: 'Final payout', amount: 10_500 },
      ],
    },
    lessons: [
      'Listings from my own area carried more weight with the adjuster than national price guides.',
      'Receipts for new tires and recent maintenance added a few hundred dollars to the valuation.',
      'I kept every message in writing and pointed to a specific listing each time.',
    ],
    status: 'resolved',
  },
  {
    id: 'sold-as-is',
    title: 'Sold a damaged car as-is',
    owner: { location: 'Atlanta, GA' },
    vehicle: { year: 2015, make: 'Nissan', model: 'Altima', mileage: 112_000, bodyStyle: 'sedan' },
    accident: { type: 'front-collision', damage: ['front-end', 'hood'], severity: 'moderate' },
    claim: { path: 'own-policy', status: 'repair-estimate' },
    narrative:
      'I slid into the back of a stopped car on a wet road. My front bumper, grille, and hood took the damage. The estimate came back at $5,800 on a car I thought was worth about $8,000 beforehand.',
    decision: {
      choice: 'sell',
      summary: 'Sold it as-is instead of paying for the $5,800 repair',
    },
    topics: ['sold'],
    outcome: {
      summary: 'Took the best of three dealer offers, $3,200, the same day',
      reportedAfter: '2 weeks later',
      costs: [
        { label: 'Repair estimate', amount: 5_800 },
        { label: 'Sold as-is for', amount: 3_200 },
      ],
    },
    lessons: [
      'Getting three offers took one afternoon, and they were more than $900 apart.',
      'In-person dealer quotes came in higher than the instant online offers I tried.',
      'I removed my toll tag and plates before handing over the keys.',
    ],
    status: 'resolved',
  },
  {
    id: 'hail-roof',
    title: 'Hail dents across the roof and hood',
    owner: { location: 'Denver, CO' },
    vehicle: { year: 2019, make: 'Toyota', model: 'RAV4', mileage: 51_000, bodyStyle: 'suv' },
    accident: { type: 'weather-damage', damage: ['roof', 'hood'], severity: 'minor' },
    claim: { path: 'own-policy', status: 'repair-estimate' },
    narrative:
      'A ten-minute hailstorm caught my RAV4 in an open parking lot. It left dozens of shallow dents across the roof and hood, but no cracked glass, and the car still drove normally.',
    decision: {
      choice: 'repair',
      summary: 'Chose paintless dent repair through the claim',
    },
    topics: ['repaired'],
    outcome: {
      summary: 'Done in four days with no repainting, after the deductible',
      reportedAfter: '3 months later',
      costs: [
        { label: 'Repair total', amount: 2_950 },
        { label: 'My deductible', amount: 500 },
      ],
    },
    lessons: [
      'Paintless dent repair kept the factory paint, which mattered to me for resale.',
      'Hail shops booked up fast after the storm, so I called first thing the next morning.',
      'My premium didn’t change at renewal, though I asked my agent about it before filing.',
    ],
    status: 'resolved',
  },
  {
    id: 'sideswipe-truck',
    title: 'Sideswiped while merging',
    owner: { location: 'Tulsa, OK' },
    vehicle: { year: 2018, make: 'Ford', model: 'F-150', mileage: 96_000, bodyStyle: 'truck' },
    accident: { type: 'side-impact', damage: ['side', 'rear'], severity: 'moderate' },
    claim: { path: 'other-driver', status: 'repair-estimate' },
    narrative:
      'A car merged into my lane on the highway and scraped down the passenger side of my truck, from the front door back to the bed. The doors still open fine, but the bed side is creased and a tail light is cracked. The other driver’s insurer accepted fault last week.',
    decision: {
      choice: 'undecided',
      summary: 'Still weighing the $6,900 repair against selling the truck as-is',
    },
    topics: ['repaired', 'sold'],
    outcome: {
      summary: 'The estimate is approved, and I’m waiting on a second shop’s quote before choosing',
      reportedAfter: '3 weeks in',
      costs: [
        { label: 'Repair estimate', amount: 6_900 },
        { label: 'Best as-is offer', amount: 18_200 },
      ],
    },
    lessons: [
      'Since the other insurer covers the repair either way, the real question for me is whether I want to keep the truck.',
      'A second estimate came in $1,100 higher because it replaced the bed side instead of repairing it.',
      'I keep a running log of every call with the adjuster, including names and dates.',
    ],
    status: 'ongoing',
  },
  {
    id: 'deer-strike',
    title: 'Hit a deer on a back road',
    owner: { location: 'Raleigh, NC' },
    vehicle: { year: 2020, make: 'Honda', model: 'CR-V', mileage: 61_000, bodyStyle: 'suv' },
    accident: { type: 'front-collision', damage: ['front-end', 'hood'], severity: 'moderate' },
    claim: { path: 'own-policy', status: 'repair-estimate' },
    narrative:
      'A deer ran out at dusk on a two-lane road. I braked but still hit it at around 30 mph. The bumper, grille, and one headlight were destroyed and the hood was bent, but the airbags didn’t deploy and I could drive home slowly.',
    decision: {
      choice: 'repair',
      summary: 'Approved the $3,850 repair through comprehensive coverage',
    },
    topics: ['repaired'],
    outcome: {
      summary: 'The car has been at the shop for five weeks, waiting on a headlight assembly',
      reportedAfter: '5 weeks in',
      costs: [
        { label: 'Repair estimate', amount: 3_850 },
        { label: 'My deductible', amount: 500 },
      ],
    },
    lessons: [
      'On my policy, the deer strike fell under comprehensive rather than collision, so the deductible was lower.',
      'I wish I’d asked about parts delays up front, since my rental coverage ends at 30 days.',
      'Photos of the scene and damage, taken before I moved the car, made the claim quick.',
    ],
    status: 'ongoing',
  },
]
