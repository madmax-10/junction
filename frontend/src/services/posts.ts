import type { MarketplaceListing } from '../types/marketplace.ts'
import type { CommunityStory, RepairMethod, RepairPostData, RepairSymptoms } from '../types/story.ts'
import { api, apiUrl, fetchAllPages } from './api.ts'

export type ApiPost = {
  id: string
  issue_id: string
  issue_type: 'buy' | 'sell' | 'repair'
  title: string
  content: string
  post_data: Record<string, unknown>
  status: 'draft' | 'approved' | 'published' | 'archived'
  approved_at: string | null
  created_at: string
  updated_at: string
}

type ApiNewCar = {
  id: string
  make: string
  model: string
  year: number
  trim: string
  msrp: string | number | null
  created_at: string
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  return items.length > 0 ? items : undefined
}

function symptoms(value: unknown): RepairSymptoms {
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  const confirmed = stringList(record.confirmed)
  const inferred = stringList(record.inferred)
  return {
    ...(confirmed ? { confirmed } : {}),
    ...(inferred ? { inferred } : {}),
  }
}

function repairMethod(value: unknown): RepairMethod | null {
  return value === 'mechanic' || value === 'self' ? value : null
}

function photoPaths(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function postPhotoUrl(postId: string, path: string) {
  const filename = path.split('/').pop() || path
  return apiUrl(`/api/posts/${postId}/photos/${encodeURIComponent(filename)}/`)
}

export function toCommunityStory(post: ApiPost): CommunityStory | null {
  if (post.issue_type !== 'repair' || post.status !== 'published') return null
  const data = post.post_data
  const make = text(data.make)
  const model = text(data.model)
  const year = numberOrNull(data.year)
  if (!make || !model || year === null) return null
  const mileage = numberOrNull(data.mileage)
  const postData: RepairPostData = {
    make,
    model,
    year,
    trim: text(data.trim),
    mileage: mileage ?? 0,
    symptoms: symptoms(data.symptoms),
    method: repairMethod(data.method),
    work_performed: text(data.work_performed),
    cost: numberOrNull(data.cost),
    mechanic_name: text(data.mechanic_name),
    owner_reported: true,
    insurance_settlement: text(data.insurance_settlement),
    photos: photoPaths(data.photos),
  }
  return {
    id: post.id,
    issue_id: post.issue_id,
    issue_type: 'repair',
    title: post.title,
    content: post.content,
    post_data: postData,
    status: 'published',
    approved_at: post.approved_at ?? post.created_at,
    created_at: post.created_at,
    updated_at: post.updated_at,
  }
}

function conditionValues(value: unknown) {
  if (!value || typeof value !== 'object') return []
  return Object.values(value).filter((item): item is string => typeof item === 'string' && item.trim() !== '')
}

function toSellListing(post: ApiPost): MarketplaceListing | null {
  if (post.issue_type !== 'sell' || post.status !== 'published') return null
  const data = post.post_data
  const make = text(data.make)
  const model = text(data.model)
  const year = numberOrNull(data.year)
  const price = numberOrNull(data.asking_price)
  if (!make || !model || year === null || price === null) return null
  const highlights = conditionValues(data.condition_details)
  const knownDamage = text(data.known_damage) || null
  const photos = photoPaths(data.photos)
  const location = text(data.location) || null
  const name = `${year} ${make} ${model}`
  return {
    id: post.id,
    source: 'owner',
    kind: 'sell',
    vehicle: {
      year,
      make,
      model,
      trim: text(data.trim),
      mileage: numberOrNull(data.mileage),
    },
    price,
    location,
    listedOn: post.created_at.slice(0, 10),
    conditionLabel: knownDamage ?? highlights[0] ?? null,
    description: post.content,
    knownDamage,
    highlights,
    photos,
    photo: photos[0] ? { src: postPhotoUrl(post.id, photos[0]), alt: name } : null,
  }
}

function toNewListing(car: ApiNewCar): MarketplaceListing | null {
  const price = numberOrNull(car.msrp)
  if (!car.make || !car.model || price === null) return null
  return {
    id: car.id,
    source: 'sample',
    kind: 'new',
    vehicle: {
      year: car.year,
      make: car.make,
      model: car.model,
      trim: car.trim ?? '',
      mileage: null,
    },
    price,
    location: null,
    listedOn: car.created_at.slice(0, 10),
    conditionLabel: null,
    description: 'Catalog price only. This is not an owner listing.',
    knownDamage: null,
    highlights: [],
    photos: [],
    photo: null,
  }
}

export async function getPost(id: string) {
  return api<ApiPost>(`/api/posts/${id}/`)
}

export async function getRepairStories() {
  const posts = await fetchAllPages<ApiPost>('/api/posts/?issue_type=repair&page_size=100')
  return posts.flatMap((post) => {
    const story = toCommunityStory(post)
    return story ? [story] : []
  })
}

export async function getMarketplaceListingsFromApi() {
  const [sellPosts, newCars] = await Promise.all([
    fetchAllPages<ApiPost>('/api/posts/?issue_type=sell&page_size=100'),
    fetchAllPages<ApiNewCar>('/api/cars/new/?page_size=100'),
  ])
  return [
    ...sellPosts.flatMap((post) => {
      const listing = toSellListing(post)
      return listing ? [listing] : []
    }),
    ...newCars.flatMap((car) => {
      const listing = toNewListing(car)
      return listing ? [listing] : []
    }),
  ]
}
