import type { MarketplaceListing } from '../types/marketplace.ts'
import type { PostContact, PostData, PostDraft, PostIssueType, PostStatus } from '../types/post.ts'
import type { CommunityStory, RepairMethod, RepairPostData, RepairSymptoms } from '../types/story.ts'
import { api, apiBlob, apiUrl, fetchAllPages } from './api.ts'

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

const issueTypes = new Set<PostIssueType>(['buy', 'sell', 'repair'])
const postStatuses = new Set<PostStatus>(['draft', 'approved', 'published', 'archived'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textFields<K extends string>(value: unknown, keys: readonly K[]) {
  if (!isRecord(value)) return undefined
  const result: Partial<Record<K, string>> = {}
  for (const key of keys) {
    const item = text(value[key]).trim()
    if (item) result[key] = item
  }
  return Object.keys(result).length > 0 ? result : undefined
}

// Tool results send money as decimal strings, while the REST API sends numbers.
function toPostData(value: unknown): PostData {
  if (!isRecord(value)) return {}
  const data: PostData = {}
  for (const key of ['make', 'model', 'trim', 'known_damage', 'location', 'fuel_type', 'work_performed', 'mechanic_name', 'insurance_settlement'] as const) {
    const item = text(value[key]).trim()
    if (item) data[key] = item
  }
  for (const key of ['year', 'mileage', 'asking_price', 'min_budget', 'max_budget', 'minimum_year', 'maximum_mileage', 'cost'] as const) {
    const item = numberOrNull(value[key])
    if (item !== null) data[key] = item
  }
  const makes = stringList(value.preferred_makes)
  const models = stringList(value.preferred_models)
  if (makes) data.preferred_makes = makes
  if (models) data.preferred_models = models
  if (value.vehicle_type === 'new' || value.vehicle_type === 'used') data.vehicle_type = value.vehicle_type
  const method = repairMethod(value.method)
  if (method) data.method = method
  const condition = textFields(value.condition_details, ['mechanical', 'exterior', 'interior', 'maintenance_history'] as const)
  if (condition) data.condition_details = condition
  const contact: PostContact | undefined = textFields(value.contact, ['phone', 'email', 'link'] as const)
  if (contact) data.contact = contact
  const repairSymptoms = symptoms(value.symptoms)
  if (repairSymptoms.confirmed || repairSymptoms.inferred) data.symptoms = repairSymptoms
  const photos = photoPaths(value.photos)
  if (photos.length > 0) data.photos = photos
  if (value.owner_reported === true) data.owner_reported = true
  return data
}

export function toPostDraft(value: unknown): PostDraft | null {
  if (!isRecord(value)) return null
  const { id, issue_type: issueType, issue_id: issueId, status } = value
  if (typeof id !== 'string' || typeof issueId !== 'string') return null
  if (!issueTypes.has(issueType as PostIssueType) || !postStatuses.has(status as PostStatus)) return null
  return {
    id,
    issueType: issueType as PostIssueType,
    issueId,
    title: text(value.title),
    content: text(value.content),
    postData: toPostData(value.post_data),
    status: status as PostStatus,
  }
}

export async function getPostDraft(id: string) {
  return toPostDraft(await getPost(id))
}

export async function updatePostDraft(id: string, changes: { title: string; content: string; post_data: PostData }) {
  const updated = toPostDraft(await api<ApiPost>(`/api/posts/${id}/`, { method: 'PATCH', body: changes }))
  if (!updated) throw new Error('The server returned an unexpected post.')
  return updated
}

export type IssuePhoto = { filename: string; path: string }

export async function listIssuePhotos(issueType: PostIssueType, issueId: string) {
  const response = await api<{ photos?: unknown }>(`/api/issues/${issueType}/${issueId}/photos/`)
  if (!Array.isArray(response.photos)) return []
  return response.photos.flatMap((photo): IssuePhoto[] =>
    isRecord(photo) && typeof photo.filename === 'string' && typeof photo.path === 'string'
      ? [{ filename: photo.filename, path: photo.path }]
      : [],
  )
}

export async function getIssuePhotoBlob(issueType: PostIssueType, issueId: string, filename: string) {
  return apiBlob(`/api/issues/${issueType}/${issueId}/photos/${encodeURIComponent(filename)}/`)
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
