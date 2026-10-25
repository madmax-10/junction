import { marketplaceListings } from '../mocks/marketplaceListings.ts'
import type { MarketplaceListing } from '../types/marketplace.ts'

// Backed by local sample listings for now; replace the body with the backend listings request.
export async function getMarketplaceListings(): Promise<MarketplaceListing[]> {
  return marketplaceListings
}
