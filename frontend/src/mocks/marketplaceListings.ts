import type { MarketplaceListing } from '../types/marketplace.ts'

// Synthetic demo content. These are not real vehicles for sale.
// Sell rows are published sell posts, shown on Buy a car. New rows are the new-car catalog.
// Photos on sell posts are credited sample images; the `photos` paths are the issue-folder locations.

const civicIssue = 'b22e0000-0000-4000-8000-000000000001'
const truckIssue = 'b22e0000-0000-4000-8000-000000000002'
const camryIssue = 'b22e0000-0000-4000-8000-000000000003'

export const marketplaceListings: MarketplaceListing[] = [
  {
    id: 'sell-2019-honda-civic',
    source: 'sample',
    kind: 'sell',
    vehicle: { year: 2019, make: 'Honda', model: 'Civic', trim: 'LX', mileage: 41200 },
    price: 17400,
    location: 'Austin, TX',
    listedOn: '2026-10-21',
    conditionLabel: 'Light scratches on the rear bumper',
    description:
      'Daily commuter, garage kept, serviced at the dealer since new. Selling because we moved to a two-row SUV.',
    knownDamage: 'A few light scratches on the rear bumper. No frame damage.',
    highlights: ['One owner', 'Dealer service records'],
    photos: [`issues/sell/${civicIssue}/${civicIssue}_1.jpg`],
    photo: {
      src: '/marketplace/2019-honda-civic.jpg',
      alt: 'Red 2019 Honda Civic sedan parked in a lot, seen from the front right',
      credit: {
        author: 'MercurySable99',
        license: 'CC BY-SA 4.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:2019_Honda_Civic_LX_Sedan.jpg',
      },
    },
  },
  {
    id: 'sell-2018-ford-f150',
    source: 'sample',
    kind: 'sell',
    vehicle: { year: 2018, make: 'Ford', model: 'F-150', trim: 'XLT', mileage: 68400 },
    price: 24800,
    location: 'Dallas, TX',
    listedOn: '2026-10-18',
    conditionLabel: 'Tailgate repaired, runs and drives',
    description: 'Used for weekend hauling. The tailgate was replaced after a low-speed bump. Maintenance is up to date.',
    knownDamage: 'Replaced tailgate skin. The bed is straight.',
    highlights: ['Runs and drives', 'Recent tailgate repair'],
    photos: [`issues/sell/${truckIssue}/${truckIssue}_1.jpg`],
    photo: {
      src: '/marketplace/2018-ford-f150.jpg',
      alt: 'Black 2018 Ford F-150 crew cab pickup parked at a curb, seen from the front right',
      credit: {
        author: 'Kevauto',
        license: 'CC BY-SA 4.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:2018_Ford_F-150_Crew_Cab_front_5.26.18.jpg',
      },
    },
  },
  {
    id: 'sell-2020-toyota-camry',
    source: 'sample',
    kind: 'sell',
    vehicle: { year: 2020, make: 'Toyota', model: 'Camry', trim: 'XLE', mileage: 39100 },
    price: 21950,
    location: 'Houston, TX',
    listedOn: '2026-10-11',
    conditionLabel: 'Clean interior, one paint repair',
    description: 'Commuter sedan with one owner. A door was repainted after a parking-lot scrape.',
    knownDamage: 'Driver door repainted. No structural damage.',
    highlights: ['One owner', 'Service records'],
    photos: [`issues/sell/${camryIssue}/${camryIssue}_1.jpg`],
    photo: {
      src: '/marketplace/2020-toyota-camry.jpg',
      alt: 'Gray 2020 Toyota Camry XSE sedan parked on a street, seen from the front right',
      credit: {
        author: 'Throwawayacc222',
        license: 'CC0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:2020_Toyota_Camry_XSE_front.jpg',
      },
    },
  },
  {
    id: 'new-2026-honda-civic',
    source: 'sample',
    kind: 'new',
    vehicle: { year: 2026, make: 'Honda', model: 'Civic', trim: 'LX', mileage: null },
    price: 24950,
    location: null,
    listedOn: '2026-10-01',
    conditionLabel: null,
    description: 'New Civic LX from the catalog. MSRP only. This is not a private listing.',
    knownDamage: null,
    highlights: [],
    photos: [],
    photo: null,
  },
  {
    id: 'new-2026-toyota-rav4',
    source: 'sample',
    kind: 'new',
    vehicle: { year: 2026, make: 'Toyota', model: 'RAV4', trim: 'XLE', mileage: null },
    price: 33420,
    location: null,
    listedOn: '2026-10-01',
    conditionLabel: null,
    description: 'New RAV4 XLE from the catalog. MSRP only. This is not a private listing.',
    knownDamage: null,
    highlights: [],
    photos: [],
    photo: null,
  },
  {
    id: 'new-2026-ford-f150',
    source: 'sample',
    kind: 'new',
    vehicle: { year: 2026, make: 'Ford', model: 'F-150', trim: 'XLT', mileage: null },
    price: 46890,
    location: null,
    listedOn: '2026-10-01',
    conditionLabel: null,
    description: 'New F-150 XLT from the catalog. MSRP only. This is not a private listing.',
    knownDamage: null,
    highlights: [],
    photos: [],
    photo: null,
  },
]
