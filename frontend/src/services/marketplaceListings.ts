import type { MarketplaceListing } from '../types/marketplace.ts'
import { getMarketplaceListingsFromApi } from './posts.ts'

export async function getMarketplaceListings(): Promise<MarketplaceListing[]> {
  return getMarketplaceListingsFromApi()
}
