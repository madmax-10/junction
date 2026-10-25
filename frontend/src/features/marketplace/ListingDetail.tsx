import { CalendarBlank, Check, MapPin, X } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useScrollFade } from '../../hooks/useScrollFade.ts'
import { easeOutQuint } from '../../styles/motion.ts'
import { isBuyerListing, type BuyerListing, type MarketplaceListing, type VehicleListing } from '../../types/marketplace.ts'
import { getVehicleName } from './marketplaceFilters.ts'
import { formatBudget, formatListedOn, formatMiles, formatPrice } from './marketplaceOptions.tsx'
import { ConditionTag } from './ListingTags.tsx'

type ListingDetailProps = {
  listing: MarketplaceListing | undefined
  onClose: () => void
}

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])'
const panelTransition = { duration: 0.3, ease: easeOutQuint }
const termClassName = 'font-body text-xs font-medium tracking-wide text-muted uppercase'

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className={termClassName}>{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function SpecList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 font-body sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-text/55">{item.label}</dt>
          <dd className="mt-0.5 text-sm font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function VehicleDetail({ listing, titleId }: { listing: VehicleListing; titleId: string }) {
  const { vehicle, photo, knownDamage, conditionLabel, highlights } = listing

  return (
    <>
      <div className="relative aspect-[16/9] bg-background">
        {photo && <img src={photo.src} alt={photo.alt} className="size-full object-cover" />}
      </div>

      <div className="px-6 pt-5 pb-6 sm:px-8 sm:pt-6">
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 pr-12">
          <div className="min-w-0">
            <h2 id={titleId} className="font-heading text-2xl font-extrabold tracking-[-0.02em]">
              {getVehicleName(listing)}
            </h2>
            <p className="mt-0.5 font-body text-sm text-muted">
              {vehicle.trim}
              {listing.kind === 'new' ? ' · New' : ' · Used'}
            </p>
          </div>
          <p className="font-heading text-2xl font-extrabold tracking-[-0.02em] tabular-nums">{formatPrice(listing.price)}</p>
        </header>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-body text-sm text-muted">
          {conditionLabel && <ConditionTag label={conditionLabel} />}
          {listing.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={16} className="text-primary" aria-hidden="true" />
              {listing.location}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <CalendarBlank size={16} className="text-primary" aria-hidden="true" />
            {formatListedOn(listing.listedOn)}
          </span>
        </div>

        <div className="mt-6 space-y-6 border-t border-border pt-6">
          <DetailSection title="From the seller">
            <p className="font-body text-sm leading-relaxed text-text/85">{listing.description}</p>
          </DetailSection>

          {knownDamage && (
            <DetailSection title="Known damage">
              <p className="font-body text-sm leading-relaxed text-text/85">{knownDamage}</p>
            </DetailSection>
          )}

          {highlights.length > 0 && (
            <DetailSection title="Highlights">
              <ul className="flex flex-wrap gap-2">
                {highlights.map((highlight) => (
                  <li
                    key={highlight}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-body text-sm"
                  >
                    <Check size={14} weight="bold" className="text-secondary" aria-hidden="true" />
                    {highlight}
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}

          <DetailSection title="Vehicle details">
            <SpecList
              items={[
                ...(vehicle.mileage !== null ? [{ label: 'Mileage', value: formatMiles(vehicle.mileage) }] : []),
                { label: 'Trim', value: vehicle.trim || 'Not listed' },
                { label: 'Year', value: vehicle.year },
                { label: listing.kind === 'new' ? 'MSRP' : 'Asking price', value: formatPrice(listing.price) },
              ]}
            />
          </DetailSection>
        </div>

        {photo?.credit && (
          <p className="mt-8 font-body text-xs text-text/50">
            Photo by {photo.credit.author}, {photo.credit.license}, via{' '}
            <a
              href={photo.credit.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded underline underline-offset-2 outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
            >
              Wikimedia Commons
            </a>
          </p>
        )}
      </div>
    </>
  )
}

function BuyerDetail({ listing, titleId }: { listing: BuyerListing; titleId: string }) {
  const vehicleLabel = listing.vehicleType === 'new' ? 'New' : listing.vehicleType === 'used' ? 'Used' : null
  const lookingFor = [...listing.makes, ...listing.models].join(', ')

  return (
    <div className="px-6 pt-8 pb-6 sm:px-8 sm:pt-8">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 pr-12">
        <div className="min-w-0">
          <p className="font-body text-xs font-medium tracking-wide text-muted uppercase">Looking to buy</p>
          <h2 id={titleId} className="mt-1 font-heading text-2xl font-extrabold tracking-[-0.02em]">
            {listing.title}
          </h2>
          {(lookingFor || vehicleLabel) && (
            <p className="mt-0.5 font-body text-sm text-muted">
              {lookingFor}
              {lookingFor && vehicleLabel ? ' · ' : ''}
              {vehicleLabel}
            </p>
          )}
        </div>
        <p className="font-heading text-2xl font-extrabold tracking-[-0.02em] tabular-nums">
          {formatBudget(listing.minBudget, listing.maxBudget)}
        </p>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-body text-sm text-muted">
        {listing.location && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={16} className="text-primary" aria-hidden="true" />
            {listing.location}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <CalendarBlank size={16} className="text-primary" aria-hidden="true" />
          {formatListedOn(listing.listedOn)}
        </span>
      </div>

      <div className="mt-6 space-y-6 border-t border-border pt-6">
        {listing.description && (
          <DetailSection title="From the buyer">
            <p className="font-body text-sm leading-relaxed text-text/85">{listing.description}</p>
          </DetailSection>
        )}
        <DetailSection title="What they want">
          <SpecList
            items={[
              ...(listing.makes.length > 0 ? [{ label: 'Makes', value: listing.makes.join(', ') }] : []),
              ...(listing.models.length > 0 ? [{ label: 'Models', value: listing.models.join(', ') }] : []),
              ...(listing.minimumYear !== null ? [{ label: 'Year', value: `${listing.minimumYear} or newer` }] : []),
              ...(listing.maximumMileage !== null
                ? [{ label: 'Max mileage', value: formatMiles(listing.maximumMileage) }]
                : []),
              ...(vehicleLabel ? [{ label: 'New or used', value: vehicleLabel }] : []),
              ...(listing.fuelType ? [{ label: 'Fuel', value: listing.fuelType }] : []),
              {
                label: 'Budget',
                value: formatBudget(listing.minBudget, listing.maxBudget),
              },
            ]}
          />
        </DetailSection>
      </div>
    </div>
  )
}

function DetailDialog({ listing, onClose }: { listing: MarketplaceListing; onClose: () => void }) {
  const titleId = `${listing.id}-detail-title`
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const setFadeElement = useScrollFade<HTMLDivElement>()

  useEffect(() => {
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus({ preventScroll: true })
    return () => returnFocusTo?.focus({ preventScroll: true })
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return

    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (element) => element.tabIndex >= 0,
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={onClose}
        className="absolute inset-0 bg-text/25 backdrop-blur-[2px]"
        aria-hidden="true"
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.2 } }}
        transition={panelTransition}
        className="relative flex max-h-full w-full max-w-[46rem] flex-col overflow-hidden rounded-[1.75rem] border border-border bg-surface shadow-card-hover"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close listing"
          className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full bg-surface text-text shadow-card transition-colors duration-200 outline-none hover:text-secondary focus-visible:ring-2 focus-visible:ring-secondary"
        >
          <X size={18} weight="bold" aria-hidden="true" />
        </button>

        <div ref={setFadeElement} className="scroll-fade-y min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {isBuyerListing(listing) ? (
            <BuyerDetail listing={listing} titleId={titleId} />
          ) : (
            <VehicleDetail listing={listing} titleId={titleId} />
          )}
        </div>
      </motion.div>
    </div>
  )
}

export function ListingDetail({ listing, onClose }: ListingDetailProps) {
  return createPortal(
    <AnimatePresence>{listing && <DetailDialog key={listing.id} listing={listing} onClose={onClose} />}</AnimatePresence>,
    document.body,
  )
}
