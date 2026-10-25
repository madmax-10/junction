import type { ChatImage, ChatMessage } from '../types/chat.ts'
import type { PostDraft } from '../types/post.ts'
import type { RepairOutcomePrompt } from '../types/repair.ts'
import type { StoryMatch, StoryMatchStatus } from '../types/story.ts'
import { chatEventsKey, readStoredJson, removeStoredKey, writeStoredJson } from './api.ts'
import { getPost, toCommunityStory, toPostDraft } from './posts.ts'
import { toOutcomeStatus, toRepairResolution } from './repairOutcome.ts'
import type { SavedSituation } from './situation.ts'

export type ToolEnvelope = {
  status: string
  data: unknown
  ids: Record<string, unknown>
  provenance: string
  error: string | null
}

export type ChatEvent =
  | { id: string; kind: 'message'; role: 'user'; author: 'user'; text: string }
  | { id: string; kind: 'message'; role: 'assistant'; author: 'coordinator'; text: string }
  | { id: string; kind: 'tool_call'; author: string; name: string; call_id: string; args: Record<string, unknown> }
  | { id: string; kind: 'tool_response'; author: string; name: string; call_id: string; response: ToolEnvelope }

const searchTools = new Set([
  'search_similar_repairs',
  'search_and_rank_used',
  'find_and_rank_buyers',
  'calculate_value_range',
])

const postTools = new Set([
  'save_post_draft',
  'update_post_draft',
  'select_post_images',
  'approve_and_publish_post',
])

const situationMarker = '\n<<saved-records>>\n'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isChatEvent(value: unknown): value is ChatEvent {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.kind !== 'string') return false
  if (value.kind === 'message') {
    return (value.role === 'user' || value.role === 'assistant') && typeof value.text === 'string'
  }
  if (value.kind === 'tool_call' || value.kind === 'tool_response') {
    return typeof value.name === 'string'
  }
  return false
}

function chatEventsStorageKey(userId: string) {
  return `${chatEventsKey}.${userId}`
}

export function readChatEvents(userId: string): ChatEvent[] {
  const stored = readStoredJson(chatEventsStorageKey(userId))
  if (!Array.isArray(stored)) return []
  return stored.filter(isChatEvent)
}

export function writeChatEvents(userId: string, events: ChatEvent[]) {
  writeStoredJson(chatEventsStorageKey(userId), events)
}

export function discardLegacyChatEvents() {
  removeStoredKey(chatEventsKey)
}

export function displayText(text: string) {
  const marker = text.indexOf(situationMarker.trim())
  return (marker === -1 ? text : text.slice(0, marker)).trim()
}

export function buildUserEventText(
  text: string,
  imageCount: number,
  saved: SavedSituation,
  vehicleName: string | null,
  isFirst: boolean,
  extraNotes: string[] = [],
) {
  const lines = [text.trim()]
  const notes: string[] = []
  if (isFirst && (saved.usedCarId || Object.keys(saved.issues).length > 0)) {
    notes.push('Saved records for this conversation:')
    if (saved.usedCarId) notes.push(`used_car_id: ${saved.usedCarId}`)
    for (const [type, id] of Object.entries(saved.issues)) {
      notes.push(`issue: ${JSON.stringify({ type, id })}`)
    }
    if (vehicleName) notes.push(`Vehicle: ${vehicleName}`)
    notes.push('Please search published community experiences for these records. Do not create another vehicle or issue.')
  }
  if (imageCount > 0) {
    notes.push(imageCount === 1 ? 'I added a photo to my saved issue.' : `I added ${imageCount} photos to my saved issue.`)
  }
  notes.push(...extraNotes)
  if (notes.length === 0) return lines.filter(Boolean).join('\n') || 'I added a photo.'
  return [...lines.filter(Boolean), situationMarker.trim(), ...notes].join('\n')
}

// The last post the agent saved, edited or published in these events, as the tool returned it.
export function postFromEvents(events: ChatEvent[]): PostDraft | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.kind !== 'tool_response' || !postTools.has(event.name) || event.response?.status !== 'ok') continue
    const post = toPostDraft(event.response.data)
    if (post) return post
  }
  return undefined
}

function stringArg(args: Record<string, unknown> | undefined, key: string) {
  const value = args?.[key]
  return typeof value === 'string' && value ? value : undefined
}

// A turn that tried to record a repair outcome, or to draft a repair post before the outcome was saved.
export function repairOutcomeFromEvents(events: ChatEvent[]): RepairOutcomePrompt | undefined {
  const calls = new Map<string, Record<string, unknown>>()
  let found: RepairOutcomePrompt | undefined
  for (const event of events) {
    if (event.kind === 'tool_call') {
      calls.set(event.call_id, event.args ?? {})
      continue
    }
    if (event.kind !== 'tool_response') continue
    const args = calls.get(event.call_id)
    const response = event.response
    if (event.name === 'record_resolution') {
      const issueId = stringArg(args, 'repair_issue_id')
      if (!issueId) continue
      const payload = args?.resolution_details
      const attempt = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}
      found = {
        issueId,
        status: toOutcomeStatus(attempt.status),
        resolution: toRepairResolution(attempt.resolution_details),
      }
    } else if (event.name === 'save_post_draft' && response?.status !== 'ok' && stringArg(args, 'issue_type') === 'repair') {
      const issueId = stringArg(args, 'issue_id')
      if (issueId) found = { issueId }
    } else if (event.name === 'get_issue_context' && response?.status === 'ok') {
      const data = response.data as Record<string, unknown> | null
      const issueId = stringArg(args, 'issue_id')
      if (issueId && data?.issue_type === 'repair' && data.status !== 'resolved') found = { issueId }
    }
  }
  return found
}

export function replyText(replies: string[], matchCount: number, post: PostDraft | undefined) {
  const text = replies.join('\n\n').trim()
  if (text) return text
  if (matchCount > 0) return 'Published experiences that matched your records are below.'
  if (post) return post.status === 'published' ? 'Your post is live.' : 'Here’s the post I drafted for you. Review it below.'
  return 'I don’t have a reply for that yet. Please try again.'
}

type RankedId = { id: string; reasons: string[]; score: number }

function reasonsFor(data: unknown, postId: string) {
  if (!isRecord(data) || !Array.isArray(data.matches)) return { reasons: [], score: 0 }
  for (const match of data.matches) {
    if (!isRecord(match) || match.post_id !== postId) continue
    const reasons = Array.isArray(match.reasons) ? match.reasons.filter((reason): reason is string => typeof reason === 'string') : []
    const score = typeof match.keyword_score === 'number' ? match.keyword_score : 0
    return { reasons, score }
  }
  return { reasons: [], score: 0 }
}

export function rankedPostIds(events: ChatEvent[]) {
  const ranked = new Map<string, RankedId>()
  let searched = false
  let failed = false
  for (const event of events) {
    if (event.kind !== 'tool_response' || !searchTools.has(event.name)) continue
    searched = true
    const status = event.response?.status
    if (status === 'error' || status === 'search_unavailable') failed = true
    const ids = event.response?.ids?.post_ids
    if (!Array.isArray(ids)) continue
    for (const id of ids) {
      if (typeof id !== 'string' || ranked.has(id)) continue
      const match = reasonsFor(event.response.data, id)
      ranked.set(id, { id, ...match })
    }
  }
  return {
    searched,
    failed,
    posts: [...ranked.values()].sort((left, right) => right.score - left.score),
  }
}

function repairSearchFailed(events: ChatEvent[]) {
  return events.some(
    (event) =>
      event.kind === 'tool_response' &&
      event.name === 'search_similar_repairs' &&
      (event.response.status === 'error' || event.response.status === 'search_unavailable'),
  )
}

export async function matchesFromEvents(events: ChatEvent[]): Promise<{ matchStatus: StoryMatchStatus; matches: StoryMatch[] }> {
  const ranked = rankedPostIds(events)
  const searchedRepairs = events.some((event) => event.kind === 'tool_response' && event.name === 'search_similar_repairs')
  const matches: StoryMatch[] = []
  await Promise.all(
    ranked.posts.map(async (rankedPost) => {
      try {
        const story = toCommunityStory(await getPost(rankedPost.id))
        if (!story) return
        matches.push({ story, score: rankedPost.score, reasons: rankedPost.reasons })
      } catch {
        // A missing post is left out. The assistant text still reports what the tool returned.
      }
    }),
  )
  const order = new Map(ranked.posts.map((post, index) => [post.id, index]))
  matches.sort((left, right) => (order.get(left.story.id) ?? 0) - (order.get(right.story.id) ?? 0))
  if (matches.length > 0) return { matchStatus: 'matched', matches }
  if (!searchedRepairs) return { matchStatus: 'matched', matches: [] }
  return { matchStatus: repairSearchFailed(events) ? 'unavailable' : 'no-match', matches: [] }
}

type Turn = {
  user: Extract<ChatEvent, { kind: 'message'; role: 'user' }>
  images: ChatImage[]
  replies: string[]
  tools: ChatEvent[]
}

function turns(events: ChatEvent[], imagesFor: Map<string, ChatImage[]>): Turn[] {
  const grouped: Turn[] = []
  for (const event of events) {
    if (event.kind === 'message' && event.role === 'user') {
      grouped.push({ user: event, images: imagesFor.get(event.id) ?? [], replies: [], tools: [] })
      continue
    }
    const turn = grouped.at(-1)
    if (!turn) continue
    if (event.kind === 'message' && event.role === 'assistant') turn.replies.push(event.text)
    else turn.tools.push(event)
  }
  return grouped
}

export async function messagesFromEvents(events: ChatEvent[], imagesFor = new Map<string, ChatImage[]>()): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = []
  for (const turn of turns(events, imagesFor)) {
    messages.push({
      id: turn.user.id,
      role: 'user',
      text: displayText(turn.user.text),
      images: turn.images,
      suggestions: [],
    })
    if (turn.replies.length === 0 && turn.tools.length === 0) continue
    const { matchStatus, matches } = await matchesFromEvents(turn.tools)
    const post = postFromEvents(turn.tools)
    const repairOutcome = post ? undefined : repairOutcomeFromEvents(turn.tools)
    messages.push({
      id: `${turn.user.id}-reply`,
      role: 'assistant',
      text: replyText(turn.replies, matches.length, post),
      matchStatus: matches.length > 0 ? 'matched' : matchStatus,
      matches,
      followUps: [],
      ...(post ? { post } : {}),
      ...(repairOutcome ? { repairOutcome } : {}),
    })
  }
  return messages
}
