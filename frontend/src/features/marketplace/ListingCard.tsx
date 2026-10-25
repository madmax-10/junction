import { Gauge, MapPin } from '@phosphor-icons/react'
import { isBuyerListing, type BuyerListing, type MarketplaceListing, type VehicleListing } from '../../types/marketplace.ts'
import { getVehicleName } from './marketplaceFilters.ts'
import { formatBudget, formatMiles, formatPrice } from './marketplaceOptions.tsx'
import { ConditionTag } from './ListingTags.tsx'

type ListingCardProps = {
  listing: MarketplaceListing
  onOpen: () => void
}

function wantedLabel(listing: BuyerListing) {
  const names = [...listing.makes, ...listing.models]
  if (names.length > 0) return names.join(', ')
  return listing.title
}

export function ListingCard({ listing, onOpen }: ListingCardProps) {
  if (isBuyerListing(listing)) return <BuyerCard listing={listing} onOpen={onOpen} />
  return <VehicleCard listing={listing} onOpen={onOpen} />
}

function BuyerCard({ listing, onOpen }: { listing: BuyerListing; onOpen: () => void }) {
  const titleId = `${listing.id}-title`
  const vehicleLabel = listing.vehicleType === 'new' ? 'New' : listing.vehicleType === 'used' ? 'Used' : null

  return (
    <article
      aria-labelledby={titleId}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-card-hover has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-primary has-[button:focus-visible]:ring-offset-2 motion-reduce:hover:translate-y-0"
    >
      <div className="flex flex-1 flex-col p-5">
        <p className="font-body text-xs font-medium tracking-wide text-muted uppercase">Looking to buy</p>
        <h2 id={titleId} className="mt-1 font-heading text-lg leading-snug font-bold tracking-tight">
          <button
            type="button"
            onClick={onOpen}
            className="text-left outline-none after:absolute after:inset-0 after:rounded-2xl"
          >
            {listing.title}
          </button>
        </h2>
        <p className="mt-0.5 truncate font-body text-sm text-muted">
          {wantedLabel(listing)}
          {vehicleLabel ? ` · ${vehicleLabel}` : ''}
        </p>

        <p className="mt-3 font-heading text-[1.375rem] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
          {formatBudget(listing.minBudget, listing.maxBudget)}
        </p>

        {(listing.minimumYear !== null || listing.maximumMileage !== null || listing.location) && (
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-4 font-body text-sm text-muted">
            {listing.minimumYear !== null && (
              <li>
                <span className="sr-only">Minimum year: </span>
                <span className="tabular-nums">{listing.minimumYear} or newer</span>
              </li>
            )}
            {listing.maximumMileage !== null && (
              <li className="flex items-center gap-1.5">
                <Gauge size={16} className="shrink-0 text-primary" aria-hidden="true" />
                <span className="sr-only">Maximum mileage: </span>
                <span className="tabular-nums">Under {formatMiles(listing.maximumMileage)}</span>
              </li>
            )}
            {listing.location && (
              <li className="flex min-w-0 items-center gap-1.5">
                <MapPin size={16} className="shrink-0 text-primary" aria-hidden="true" />
                <span className="sr-only">Location: </span>
                <span className="truncate">{listing.location}</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </article>
  )
}

function VehicleCard({ listing, onOpen }: { listing: VehicleListing; onOpen: () => void }) {
  const { vehicle, photo, knownDamage, conditionLabel } = listing
  const titleId = `${listing.id}-title`

  return (
    <article
      aria-labelledby={titleId}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-card-hover has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-primary has-[button:focus-visible]:ring-offset-2 motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-background">
        {photo && (
          <img
            src={photo.src}
            alt={photo.alt}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h2 id={titleId} className="font-heading text-lg leading-snug font-bold tracking-tight">
          <button
            type="button"
            onClick={onOpen}
            className="text-left outline-none after:absolute after:inset-0 after:rounded-2xl"
          >
            {getVehicleName(listing)}
          </button>
        </h2>
        <p className="mt-0.5 truncate font-body text-sm text-muted">
          {vehicle.trim}
          {listing.kind === 'new' ? ' · New' : ' · Used'}
        </p>

        <p className="mt-3 font-heading text-[1.375rem] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
          {formatPrice(listing.price)}
        </p>

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-4 font-body text-sm text-muted">
          {vehicle.mileage !== null && (
            <li className="flex items-center gap-1.5">
              <Gauge size={16} className="shrink-0 text-primary" aria-hidden="true" />
              <span className="sr-only">Mileage: </span>
              <span className="tabular-nums">{formatMiles(vehicle.mileage)}</span>
            </li>
          )}
          {listing.location && (
            <li className="flex min-w-0 items-center gap-1.5">
              <MapPin size={16} className="shrink-0 text-primary" aria-hidden="true" />
              <span className="sr-only">Location: </span>
              <span className="truncate">{listing.location}</span>
            </li>
          )}
        </ul>

        <div className="mt-auto flex min-w-0 items-center gap-2 pt-4">
          {conditionLabel && <ConditionTag label={conditionLabel} />}
          {knownDamage && (
            <p className="truncate font-body text-xs text-muted">
              <span className="sr-only">Known damage: </span>
              {knownDamage}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
