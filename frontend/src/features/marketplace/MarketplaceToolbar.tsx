import { CaretDown, MagnifyingGlass, X } from '@phosphor-icons/react'
import { fieldClassName } from '../../components/ui/fieldStyles.ts'
import type { ListingCategory, MarketplaceFilters } from '../../types/marketplace.ts'
import { getConditionOptions, mileageOptions, priceOptions, yearOptions } from './marketplaceOptions.tsx'

type MarketplaceToolbarProps = {
  category: ListingCategory
  filters: MarketplaceFilters
  onChange: (changes: Partial<MarketplaceFilters>) => void
}

type FilterSelectProps<TValue extends string | number> = {
  id: string
  label: string
  anyLabel: string
  value: TValue | null
  options: { value: TValue; label: string }[]
  onChange: (value: TValue | null) => void
}

function FilterSelect<TValue extends string | number>({
  id,
  label,
  anyLabel,
  value,
  options,
  onChange,
}: FilterSelectProps<TValue>) {
  const isActive = value !== null

  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value === null ? '' : String(value)}
        onChange={(event) =>
          onChange(options.find((option) => String(option.value) === event.target.value)?.value ?? null)
        }
        className={`h-11 w-full cursor-pointer appearance-none truncate rounded-full border pr-10 pl-4 font-body text-sm font-medium transition-[background-color,border-color,color] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
          isActive
            ? 'border-primary/30 bg-primary-light text-primary'
            : 'border-text/10 bg-surface text-text hover:border-primary/40'
        }`}
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
      <CaretDown
        size={14}
        weight="bold"
        className={`pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 ${isActive ? 'text-primary' : 'text-text/50'}`}
        aria-hidden="true"
      />
    </div>
  )
}

export function MarketplaceToolbar({ category, filters, onChange }: MarketplaceToolbarProps) {
  return (
    <div className="flex flex-col gap-3 @4xl:flex-row @4xl:items-center">
      <div role="search" className="relative @4xl:min-w-56 @4xl:flex-1">
        <label htmlFor="marketplace-search" className="sr-only">
          Search by make or model
        </label>
        <MagnifyingGlass
          size={18}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text/45"
          aria-hidden="true"
        />
        <input
          id="marketplace-search"
          type="search"
          autoComplete="off"
          value={filters.query}
          onChange={(event) => onChange({ query: event.target.value })}
          placeholder="Search make or model"
          className={`${fieldClassName} h-11 pr-11 pl-11 [&::-webkit-search-cancel-button]:hidden`}
        />
        {filters.query && (
          <button
            type="button"
            onClick={() => onChange({ query: '' })}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-text/55 transition-colors duration-200 outline-none hover:bg-background hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={14} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>

      <div role="group" aria-label="Filters" className="grid grid-cols-2 gap-2 @xl:grid-cols-4 @4xl:flex @4xl:shrink-0">
        <FilterSelect
          id="marketplace-price"
          label="Price"
          anyLabel="Any price"
          value={filters.price}
          options={priceOptions}
          onChange={(price) => onChange({ price })}
        />
        <FilterSelect
          id="marketplace-year"
          label="Model year"
          anyLabel="Any year"
          value={filters.minYear}
          options={yearOptions}
          onChange={(minYear) => onChange({ minYear })}
        />
        <FilterSelect
          id="marketplace-mileage"
          label="Mileage"
          anyLabel="Any mileage"
          value={filters.maxMileage}
          options={mileageOptions}
          onChange={(maxMileage) => onChange({ maxMileage })}
        />
        <FilterSelect
          id="marketplace-condition"
          label="Condition"
          anyLabel="Any condition"
          value={filters.condition}
          options={getConditionOptions(category)}
          onChange={(condition) => onChange({ condition })}
        />
      </div>
    </div>
  )
}
