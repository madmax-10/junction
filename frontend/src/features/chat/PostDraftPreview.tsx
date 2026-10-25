import { EnvelopeSimple, Info, LinkSimple, Phone } from '@phosphor-icons/react'
import type { PostData, PostDraft } from '../../types/post.ts'
import { formatMiles, formatPrice } from '../marketplace/marketplaceOptions.tsx'

type PostDraftPreviewProps = {
  post: PostDraft
  photoUrls: Map<string, string>
}

type Fact = { label: string; value: string }

function vehicleName(data: PostData) {
  return [data.year, data.make, data.model].filter(Boolean).join(' ')
}

function budget(data: PostData) {
  const { min_budget: min, max_budget: max } = data
  if (min !== undefined && max !== undefined) return `${formatPrice(min)} – ${formatPrice(max)}`
  if (max !== undefined) return `Up to ${formatPrice(max)}`
  if (min !== undefined) return `From ${formatPrice(min)}`
  return null
}

function highlight(post: PostDraft) {
  const data = post.postData
  if (post.issueType === 'sell' && data.asking_price !== undefined) return formatPrice(data.asking_price)
  if (post.issueType === 'buy') return budget(data)
  if (post.issueType === 'repair' && data.cost !== undefined) return `Cost ${formatPrice(data.cost)}`
  return null
}

function facts(post: PostDraft): Fact[] {
  const data = post.postData
  const items: Fact[] = []
  const add = (label: string, value: string | number | undefined | null) => {
    if (value !== undefined && value !== null && value !== '') items.push({ label, value: String(value) })
  }
  if (post.issueType === 'sell') {
    add('Trim', data.trim)
    add('Mileage', data.mileage !== undefined ? formatMiles(data.mileage) : null)
    add('Location', data.location)
    add('Mechanical', data.condition_details?.mechanical)
    add('Exterior', data.condition_details?.exterior)
    add('Interior', data.condition_details?.interior)
    add('Maintenance', data.condition_details?.maintenance_history)
    add('Known damage', data.known_damage)
  }
  if (post.issueType === 'buy') {
    add('Makes', data.preferred_makes?.join(', '))
    add('Models', data.preferred_models?.join(', '))
    add('Year', data.minimum_year !== undefined ? `${data.minimum_year} or newer` : null)
    add('Max mileage', data.maximum_mileage !== undefined ? formatMiles(data.maximum_mileage) : null)
    add('New or used', data.vehicle_type === 'new' ? 'New' : data.vehicle_type === 'used' ? 'Used' : null)
    add('Fuel', data.fuel_type)
    add('Location', data.location)
  }
  if (post.issueType === 'repair') {
    add('Trim', data.trim)
    add('Mileage', data.mileage !== undefined ? formatMiles(data.mileage) : null)
    add('Symptoms', data.symptoms?.confirmed?.join('; '))
    add('Possibly related', data.symptoms?.inferred?.join('; '))
    add('Fixed by', data.method === 'self' ? 'Myself' : data.method === 'mechanic' ? data.mechanic_name || 'A mechanic' : null)
    add('Work done', data.work_performed)
    add('Insurance', data.insurance_settlement)
  }
  return items
}

export function PostDraftPreview({ post, photoUrls }: PostDraftPreviewProps) {
  const data = post.postData
  const name = vehicleName(data)
  const price = highlight(post)
  const details = facts(post)
  const photos = (data.photos ?? []).flatMap((path) => {
    const url = photoUrls.get(path)
    return url ? [{ path, url }] : []
  })
  const contact = data.contact

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-surface">
      {photos.length === 1 && (
        <div className="aspect-[16/10] bg-background">
          <img src={photos[0].url} alt={`Photo for ${post.title}`} className="size-full object-cover" />
        </div>
      )}
      {photos.length > 1 && (
        <ul className="flex snap-x gap-1 overflow-x-auto bg-background" aria-label="Photos in this post">
          {photos.map((photo, index) => (
            <li key={photo.path} className="h-40 shrink-0 snap-start">
              <img
                src={photo.url}
                alt={`Photo ${index + 1} of ${photos.length}`}
                className="h-full w-auto max-w-none object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      <div className="p-4 sm:p-5">
        {name && <p className="font-body text-xs font-medium tracking-wide text-muted uppercase">{name}</p>}
        <h3 className="mt-1 font-heading text-lg leading-snug font-bold tracking-tight break-words">
          {post.title || 'Untitled post'}
        </h3>
        {price && (
          <p className="mt-2 font-heading text-[1.25rem] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
            {price}
          </p>
        )}

        <p className="mt-3 font-body text-[0.95rem] leading-relaxed break-words whitespace-pre-wrap">{post.content}</p>

        {details.length > 0 && (
          <dl className="mt-4 grid gap-x-4 gap-y-2 border-t border-border pt-4 font-body text-sm sm:grid-cols-2">
            {details.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-xs text-muted">{fact.label}</dt>
                <dd className="break-words">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {post.issueType !== 'repair' && (
          <div className="mt-4 border-t border-border pt-4 font-body text-sm">
            <p className="text-xs text-muted">Public contact</p>
            {contact ? (
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
                {contact.phone && (
                  <li className="flex items-center gap-1.5">
                    <Phone size={16} className="text-primary" aria-hidden="true" />
                    {contact.phone}
                  </li>
                )}
                {contact.email && (
                  <li className="flex min-w-0 items-center gap-1.5">
                    <EnvelopeSimple size={16} className="shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate">{contact.email}</span>
                  </li>
                )}
                {contact.link && (
                  <li className="flex min-w-0 items-center gap-1.5">
                    <LinkSimple size={16} className="shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate">{contact.link}</span>
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-1">None. People can message you here on the app.</p>
            )}
          </div>
        )}

        {post.issueType === 'repair' && (
          <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-background px-3 py-2 font-body text-xs text-muted">
            <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
            Shared as your own experience. It is owner-reported and not independently verified.
          </p>
        )}
      </div>
    </article>
  )
}
