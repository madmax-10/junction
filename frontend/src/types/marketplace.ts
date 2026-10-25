export type ListingCategory = 'sell' | 'buy'

export type VehicleKind = 'used' | 'new'

export type PriceRange = 'under-5k' | '5k-10k' | '10k-20k' | '20k-30k' | 'over-30k'

export type ListingPhoto = {
  src: string
  alt: string
  credit?: { author: string; license: string; sourceUrl: string }
}

type ListingBase = {
  id: string
  source: 'sample' | 'owner'
  location: string | null
  listedOn: string
  description: string
}

// Published sell posts, and the new-car catalog. Shown on Buy a car.
export type VehicleListing = ListingBase & {
  kind: 'sell' | 'new'
  vehicle: {
    year: number
    make: string
    model: string
    trim: string
    mileage: number | null
  }
  price: number
  conditionLabel: string | null
  knownDamage: string | null
  highlights: string[]
  photos: string[]
  photo: ListingPhoto | null
}

// Published buy posts: someone looking for a car. Shown on Sell your car.
export type BuyerListing = ListingBase & {
  kind: 'buy'
  title: string
  minBudget: number | null
  maxBudget: number | null
  makes: string[]
  models: string[]
  minimumYear: number | null
  maximumMileage: number | null
  vehicleType: VehicleKind | null
  fuelType: string | null
}

export type MarketplaceListing = VehicleListing | BuyerListing

export function isBuyerListing(listing: MarketplaceListing): listing is BuyerListing {
  return listing.kind === 'buy'
}

export type MarketplaceFilters = {
  query: string
  price: PriceRange | null
  yearMin: number | null
  yearMax: number | null
  location: string | null
  trim: string | null
  vehicleType: VehicleKind | null
}
