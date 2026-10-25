export type ListingCategory = 'sell' | 'buy'

export type VehicleKind = 'used' | 'new'

export type PriceRange = 'under-5k' | '5k-10k' | '10k-20k' | '20k-30k' | 'over-30k'

export type ListingPhoto = {
  src: string
  alt: string
  credit?: { author: string; license: string; sourceUrl: string }
}

// Sell posts and the new-car catalog. Used cars for sale are published sell posts.
export type MarketplaceListing = {
  id: string
  source: 'sample' | 'owner'
  kind: 'sell' | 'new'
  vehicle: {
    year: number
    make: string
    model: string
    trim: string
    mileage: number | null
  }
  price: number
  location: string | null
  listedOn: string
  conditionLabel: string | null
  description: string
  knownDamage: string | null
  highlights: string[]
  photos: string[]
  photo: ListingPhoto | null
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
