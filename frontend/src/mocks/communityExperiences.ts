import type { CommunityStory, RepairPostData } from '../types/story.ts'

// Synthetic demo content. These are not real people or real outcomes.
// Each story is a published repair post.

function repairStory(
  story: Omit<CommunityStory, 'issue_type' | 'status' | 'post_data'> & { post_data: Omit<RepairPostData, 'owner_reported'> },
): CommunityStory {
  return {
    ...story,
    issue_type: 'repair',
    status: 'published',
    post_data: { ...story.post_data, owner_reported: true },
  }
}

export const communityStories: CommunityStory[] = [
  repairStory({
    id: 'rear-end-red-light',
    issue_id: 'a11e0000-0000-4000-8000-000000000001',
    title: 'Bumper cover and trunk latch repaired',
    content:
      'I was stopped at a red light when a pickup rolled into the back of my Civic. The bumper cover cracked, the trunk lid would not close, and the reverse sensor stopped working. A shop replaced the cover and the latch.',
    post_data: {
      make: 'Honda',
      model: 'Civic',
      year: 2019,
      trim: 'EX',
      mileage: 42000,
      symptoms: { confirmed: ['Trunk will not close', 'Reverse sensor stopped'] },
      method: 'mechanic',
      work_performed: 'Replaced the bumper cover and trunk latch. The reverse sensor works again.',
      cost: 4600,
      mechanic_name: 'Austin Body Shop',
      insurance_settlement: "The other driver's insurer paid the $4,600 repair.",
      photos: ['issues/repair/a11e0000-0000-4000-8000-000000000001/a11e0000-0000-4000-8000-000000000001_1.jpg'],
    },
    approved_at: '2026-08-12T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-12T00:00:00Z',
  }),
  repairStory({
    id: 'side-impact-frame',
    issue_id: 'a11e0000-0000-4000-8000-000000000002',
    title: 'Driver-side doors and pillar repaired',
    content:
      'Someone ran a stop sign and hit the driver side. Both doors and the pillar were pushed in. A certified shop pulled the opening back into spec and replaced the doors.',
    post_data: {
      make: 'Subaru',
      model: 'Outback',
      year: 2017,
      trim: 'Premium',
      mileage: 88000,
      symptoms: { confirmed: ['Driver doors pushed in', 'Pillar out of line'] },
      method: 'mechanic',
      work_performed: 'Replaced both driver-side doors and pulled the pillar back into spec.',
      cost: 8200,
      mechanic_name: 'Houston Frame & Body',
      insurance_settlement: 'My own policy covered the repair after a $500 deductible.',
      photos: [],
    },
    approved_at: '2026-07-02T00:00:00Z',
    created_at: '2026-06-18T00:00:00Z',
    updated_at: '2026-07-02T00:00:00Z',
  }),
  repairStory({
    id: 'hail-hood',
    issue_id: 'a11e0000-0000-4000-8000-000000000003',
    title: 'Hail dents repaired without new panels',
    content:
      'A hailstorm left dents across the hood, roof, and trunk. Paintless dent repair got most of them out. The hood still shows a few marks in direct sun.',
    post_data: {
      make: 'Toyota',
      model: 'RAV4',
      year: 2019,
      trim: 'XLE',
      mileage: 51000,
      symptoms: { confirmed: ['Hail dents on the hood and roof'] },
      method: 'mechanic',
      work_performed: 'Paintless dent repair on the hood, roof, and trunk.',
      cost: 1800,
      mechanic_name: 'North Loop Dent Repair',
      insurance_settlement: 'Comprehensive coverage paid the dent repair minus the deductible.',
      photos: [],
    },
    approved_at: '2026-05-20T00:00:00Z',
    created_at: '2026-05-09T00:00:00Z',
    updated_at: '2026-05-20T00:00:00Z',
  }),
  repairStory({
    id: 'stop-and-go',
    issue_id: 'a11e0000-0000-4000-8000-000000000004',
    title: 'Tailgate and rear lights replaced at home',
    content:
      'In stop-and-go traffic the car behind me tapped the tailgate. The tailgate skin and one rear light cracked. I ordered the parts and swapped them in the driveway over a weekend.',
    post_data: {
      make: 'Ford',
      model: 'F-150',
      year: 2018,
      trim: 'XLT',
      mileage: 96000,
      symptoms: { confirmed: ['Cracked tailgate', 'Broken rear light'], inferred: ['Possible sensor misalignment'] },
      method: 'self',
      work_performed: 'Replaced the tailgate skin and the passenger rear light in the driveway.',
      cost: 640,
      mechanic_name: '',
      insurance_settlement: 'I paid for the parts and did not file a claim.',
      photos: [],
    },
    approved_at: '2026-04-03T00:00:00Z',
    created_at: '2026-03-22T00:00:00Z',
    updated_at: '2026-04-03T00:00:00Z',
  }),
]
