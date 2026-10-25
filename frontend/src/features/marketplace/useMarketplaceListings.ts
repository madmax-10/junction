import { useCallback, useEffect, useState } from 'react'
import { getMarketplaceListings } from '../../services/marketplaceListings.ts'
import type { MarketplaceListing } from '../../types/marketplace.ts'

type ListingsState =
  | { status: 'loading'; listings: [] }
  | { status: 'ready'; listings: MarketplaceListing[] }
  | { status: 'error'; listings: [] }

export function useMarketplaceListings() {
  const [state, setState] = useState<ListingsState>({ status: 'loading', listings: [] })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    getMarketplaceListings().then(
      (listings) => isCurrent && setState({ status: 'ready', listings }),
      () => isCurrent && setState({ status: 'error', listings: [] }),
    )
    return () => {
      isCurrent = false
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading', listings: [] })
    setAttempt((current) => current + 1)
  }, [])

  return { ...state, retry }
}
