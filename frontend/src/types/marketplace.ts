import type { DamageSeverity } from './story.ts'

export type ListingCategory = 'replacement' | 'damaged'

// Sample listings are synthetic demo content; owner listings will come from real sellers.
export type ListingSource = 'sample' | 'owner'

export type VehicleCondition = 'excellent' | 'good' | 'fair'

export type ListingCondition = VehicleCondition | DamageSeverity

export type TitleStatus = 'clean' | 'rebuilt' | 'salvage'

export type ListingPhoto = {
  src: string
  alt: string
  credit: { author: string; license: string; sourceUrl: string }
}

export type ListingDamage = {
  areas: string[]
  runsAndDrives: boolean
  airbagsDeployed: boolean
  repairQuote: number | null
}

export type MarketplaceListing = {
  id: string
  source: ListingSource
  category: ListingCategory
  vehicle: {
    year: number
    make: string
    model: string
    trim: string
    bodyStyle: string
    mileage: number
    exteriorColor: string
    drivetrain: string
    transmission: string
    engine: string
  }
  price: number
  location: string
  listedOn: string
  condition: ListingCondition
  titleStatus: TitleStatus
  description: string
  highlights: string[]
  damage: ListingDamage | null
  photo: ListingPhoto
}

export type PriceRange = 'under-5k' | '5k-10k' | '10k-20k' | '20k-30k' | 'over-30k'

export type MarketplaceFilters = {
  query: string
  price: PriceRange | null
  minYear: number | null
  maxMileage: number | null
  condition: ListingCondition | null
}
