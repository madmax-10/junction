import type { RepairIssueOutcome, RepairOutcomeStatus, RepairResolution } from '../types/repair.ts'
import { api, fetchAllPages } from './api.ts'
import { toPostDraft, type ApiPost } from './posts.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function amount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

// Accepts the issue's stored details or the payload the assistant tried to record.
export function toRepairResolution(value: unknown): Partial<RepairResolution> | undefined {
  if (!isRecord(value)) return undefined
  const resolution: Partial<RepairResolution> = {}
  if (value.method === 'mechanic' || value.method === 'self') resolution.method = value.method
  for (const key of ['work_performed', 'instructions', 'mechanic_name', 'location', 'insurance_settlement'] as const) {
    const item = text(value[key])
    if (item) resolution[key] = item
  }
  const cost = amount(value.cost)
  if (cost !== undefined) resolution.cost = cost
  if (Array.isArray(value.parts_used)) {
    const parts = value.parts_used.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    if (parts.length > 0) resolution.parts_used = parts
  }
  return Object.keys(resolution).length > 0 ? resolution : undefined
}

export function toOutcomeStatus(value: unknown): RepairOutcomeStatus | undefined {
  return value === 'resolved' || value === 'unresolved' || value === 'unsure' ? value : undefined
}

function toIssueOutcome(value: unknown): RepairIssueOutcome {
  if (!isRecord(value) || typeof value.id !== 'string') throw new Error('The server returned an unexpected repair issue.')
  const resolution = toRepairResolution(value.resolution_details)
  return {
    id: value.id,
    status: toOutcomeStatus(value.status) ?? 'open',
    resolution: resolution?.method ? (resolution as RepairResolution) : null,
  }
}

export async function getRepairOutcome(issueId: string) {
  return toIssueOutcome(await api<unknown>(`/api/issues/repair/${issueId}/`))
}

export async function saveRepairOutcome(issueId: string, status: RepairOutcomeStatus, resolution: RepairResolution) {
  return toIssueOutcome(
    await api<unknown>(`/api/issues/repair/${issueId}/resolution/`, {
      method: 'PATCH',
      body: { status, resolution_details: resolution },
    }),
  )
}

// The newest post the user already has for this repair, published first.
export async function findRepairPost(issueId: string) {
  const posts = await fetchAllPages<ApiPost>('/api/posts/?mine=true&issue_type=repair&page_size=100')
  const own = posts
    .filter((post) => post.issue_type === 'repair' && post.issue_id === issueId && post.status !== 'archived')
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
  const chosen = own.find((post) => post.status === 'published') ?? own[0]
  return chosen ? toPostDraft(chosen) : null
}
