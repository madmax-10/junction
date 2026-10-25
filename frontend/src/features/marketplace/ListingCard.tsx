import { Gauge, MapPin } from '@phosphor-icons/react'
import type { MarketplaceListing } from '../../types/marketplace.ts'
import { getVehicleName } from './marketplaceFilters.ts'
import { formatMiles, formatPrice } from './marketplaceOptions.tsx'
import { ConditionTag } from './ListingTags.tsx'

type ListingCardProps = {
  listing: MarketplaceListing
  onOpen: () => void
}

export function ListingCard({ listing, onOpen }: ListingCardProps) {
  const { vehicle, photo, damage } = listing
  const titleId = `${listing.id}-title`

  return (
    <article
      aria-labelledby={titleId}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-text/[0.06] bg-surface shadow-card transition-[box-shadow,transform] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-card-hover has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-primary has-[button:focus-visible]:ring-offset-2 motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-background">
        <img
          src={photo.src}
          alt={photo.alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
        />
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
        <p className="mt-0.5 truncate font-body text-sm text-text/60">
          {vehicle.trim} · {vehicle.bodyStyle}
        </p>

        <p className="mt-3 font-heading text-[1.375rem] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
          {formatPrice(listing.price)}
        </p>

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-text/[0.06] pt-4 font-body text-sm text-text/70">
          <li className="flex items-center gap-1.5">
            <Gauge size={16} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Mileage: </span>
            <span className="tabular-nums">{formatMiles(vehicle.mileage)}</span>
          </li>
          <li className="flex min-w-0 items-center gap-1.5">
            <MapPin size={16} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Location: </span>
            <span className="truncate">{listing.location}</span>
          </li>
        </ul>

        <div className="mt-auto flex min-w-0 items-center gap-2 pt-4">
          <ConditionTag condition={listing.condition} />
          {damage && (
            <p className="truncate font-body text-xs text-text/60">
              <span className="sr-only">Damaged areas: </span>
              {damage.areas.join(', ')}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
