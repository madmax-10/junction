const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

const accessKey = 'afterward.access'
const refreshKey = 'afterward.refresh'
export const chatEventsKey = 'afterward.chat-events'

export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string>

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  formData?: FormData
  auth?: boolean
  retry?: boolean
}

type ErrorBody = {
  message: string
  fields: Record<string, string>
}

function readStorage(key: string) {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // Private mode can reject storage. The session then lasts until reload.
  }
}

function removeStorage(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Ignore storage failures. The in-memory session is cleared by the caller.
  }
}

export function getAccessToken() {
  return readStorage(accessKey)
}

export function getRefreshToken() {
  return readStorage(refreshKey)
}

export function setTokens(access: string, refresh: string) {
  writeStorage(accessKey, access)
  writeStorage(refreshKey, refresh)
}

export function removeStoredKey(key: string) {
  removeStorage(key)
}

export function clearSession() {
  removeStorage(accessKey)
  removeStorage(refreshKey)
}

export function readStoredJson(key: string): unknown {
  const raw = readStorage(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function writeStoredJson(key: string, value: unknown) {
  writeStorage(key, JSON.stringify(value))
}

function resolveUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`
}

function fieldText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(' ')
  if (value && typeof value === 'object') {
    return Object.values(value).map(fieldText).filter(Boolean).join(' ')
  }
  return ''
}

function parseError(body: unknown, status: number): ErrorBody {
  if (!body || typeof body !== 'object') {
    return { message: status === 503 ? 'The assistant is unavailable right now. Please try again.' : 'Something went wrong. Please try again.', fields: {} }
  }
  const fields: Record<string, string> = {}
  const messages: string[] = []
  for (const [key, value] of Object.entries(body)) {
    const text = fieldText(value)
    if (!text) continue
    if (key === 'detail' || key === 'non_field_errors') {
      messages.push(text)
    } else {
      fields[key] = text
      messages.push(text)
    }
  }
  return {
    message: messages.join(' ') || 'Something went wrong. Please try again.',
    fields,
  }
}

let refreshPromise: Promise<string | null> | null = null

async function refreshAccess() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refresh = getRefreshToken()
      if (!refresh) return null
      try {
        const response = await fetch(resolveUrl('/api/auth/refresh/'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        })
        if (!response.ok) {
          clearSession()
          return null
        }
        const body = (await response.json()) as { access?: unknown }
        if (typeof body.access !== 'string') {
          clearSession()
          return null
        }
        writeStorage(accessKey, body.access)
        return body.access
      } catch {
        clearSession()
        return null
      } finally {
        refreshPromise = null
      }
    })()
  }
  return refreshPromise
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers()
  if (!options.formData) headers.set('Content-Type', 'application/json')
  if (options.auth !== false) {
    const access = getAccessToken()
    if (access) headers.set('Authorization', `Bearer ${access}`)
  }

  let response: Response
  try {
    response = await fetch(resolveUrl(path), {
      method: options.method ?? 'GET',
      headers,
      body: options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    })
  } catch {
    throw new ApiError('Could not reach the server. Check that it is running and try again.', 0)
  }

  if (response.status === 401 && options.auth !== false && options.retry !== false) {
    const access = await refreshAccess()
    if (access) return api<T>(path, { ...options, retry: false })
    throw new ApiError('Your session expired. Sign in again.', 401)
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const parsed = parseError(payload, response.status)
    throw new ApiError(parsed.message, response.status, parsed.fields)
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export async function apiBlob(path: string, retry = true): Promise<Blob> {
  const headers = new Headers()
  const access = getAccessToken()
  if (access) headers.set('Authorization', `Bearer ${access}`)
  let response: Response
  try {
    response = await fetch(resolveUrl(path), { headers })
  } catch {
    throw new ApiError('Could not reach the server. Check that it is running and try again.', 0)
  }
  if (response.status === 401 && retry) {
    if (await refreshAccess()) return apiBlob(path, false)
    throw new ApiError('Your session expired. Sign in again.', 401)
  }
  if (!response.ok) throw new ApiError('Could not load the file.', response.status)
  return response.blob()
}

export type Page<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export async function fetchAllPages<T>(path: string): Promise<T[]> {
  const items: T[] = []
  const seen = new Set<string>()
  let next: string | null = path
  while (next && !seen.has(next) && seen.size < 50) {
    seen.add(next)
    const page: Page<T> = await api<Page<T>>(next)
    items.push(...page.results)
    next = page.next
  }
  return items
}

export function apiUrl(path: string) {
  return resolveUrl(path)
}
