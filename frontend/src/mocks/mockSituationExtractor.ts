import type { ExtractedDetail } from '../types/extraction.ts'
import type { AccidentType, CurrentSituation } from '../types/intake.ts'
import { vehicleCatalog, vehicleYears } from './vehicleCatalog.ts'

// Keyword rules standing in for a real extraction model. Only details the user states outright
// are returned: nothing is inferred (a model never implies a make) and photos are never read.

type VehicleMention = {
  make: string | null
  model: string | null
  year: string | null
  evidence: string
}

const makeAliases: Record<string, string> = {
  chevy: 'Chevrolet',
  vw: 'Volkswagen',
  mercedes: 'Mercedes-Benz',
  benz: 'Mercedes-Benz',
}

// Names that are also everyday words only count when written with their brand capitalization.
const caseSensitiveMakes = new Set(['Ram'])

const ownershipCue =
  /\b(?:my|our|i\s+(?:drive|drove|own|have|had|was\s+driving))\s+(?:an?\s+|the\s+)?(?:((?:19|20)\d{2})\s+)?$/i

const qualifierCue = /(?:\b(?:not|never|no|might|may|could|would|if|whether|worried|afraid|hope|think)\b|n['’]t\b)[^.!?]*$/i

const mileagePattern =
  /\b(\d{1,3}(?:,\d{3})+|\d{4,7}|\d{1,3}(?:\.\d+)?\s?k)\s*(?:miles|mi)\b(?!\s+(?:away|from|down|per|to|an?\s+hour))/i

const accidentPatterns: [AccidentType, RegExp][] = [
  ['front-collision', /\bi\s+rear[- ]?ended\b/i],
  ['rear-end', /\brear[- ]?end(?:ed)?\b|\bhit\s+(?:me\s+)?from\s+behind\b|\bbacked\s+into\s+me\b/i],
  [
    'side-impact',
    /\bt[- ]?boned\b|\bside[- ]?impact\b|\bside[- ]?swiped\b|\bhit\s+(?:me\s+)?on\s+the\s+(?:driver|passenger)['’]?s?\s+side\b/i,
  ],
  [
    'front-collision',
    /\bhead[- ]?on\b|\bfront[- ]?(?:end\s+)?collision\b|\bran\s+into\s+the\s+back\s+of\b|\bhit\s+the\s+car\s+in\s+front\b/i,
  ],
  ['weather-damage', /\bhail(?:storm)?\b|\bflood(?:ed|ing)?\b|\b(?:tree|branch)\s+fell\b|\bfallen\s+(?:tree|branch)\b/i],
]

const situationPatterns: [CurrentSituation, RegExp][] = [
  ['total-loss', /\btotal(?:l)?ed\b|\btotal(?:ed)?\s+loss\b|\bwritten\s+off\b|\bwrite[- ]?off\b/i],
  [
    'repair-estimate',
    /\b(?:an?|the|my|their|repair|shop['’]?s?)\s+(?:repair\s+)?estimate\b|\bestimated?\s+(?:at|of)\s+\$|\b(?:got|received|have)\s+(?:a\s+)?quote\b/i,
  ],
]

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function namePattern(name: string, flags: string) {
  return new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, flags)
}

function byLongestName(a: string, b: string) {
  return b.length - a.length
}

function sentenceBefore(text: string, index: number, maxLength: number) {
  return text.slice(Math.max(0, index - maxLength), index)
}

function isStatedPlainly(text: string, index: number) {
  return !qualifierCue.test(sentenceBefore(text, index, 30))
}

function toModelYear(candidate: string | undefined) {
  return candidate && vehicleYears.includes(candidate) ? candidate : null
}

function findOwnedMention(text: string, name: string, flags: string) {
  const pattern = namePattern(name, `${flags}g`)
  for (const match of text.matchAll(pattern)) {
    const before = sentenceBefore(text, match.index, 40)
    const cue = ownershipCue.exec(before)
    if (cue) {
      return {
        start: match.index - before.length + cue.index,
        end: match.index + match[0].length,
        year: toModelYear(cue[1]),
      }
    }
  }
  return null
}

function findVehicle(text: string): VehicleMention | null {
  const makeNames = [
    ...Object.keys(vehicleCatalog).map((make) => [make, make] as const),
    ...Object.entries(makeAliases),
  ].sort(([a], [b]) => byLongestName(a, b))

  for (const [name, make] of makeNames) {
    const mention = findOwnedMention(text, name, caseSensitiveMakes.has(name) ? '' : 'i')
    if (!mention) continue

    const after = text.slice(mention.end)
    const model = [...(vehicleCatalog[make] ?? [])]
      .sort(byLongestName)
      .find((candidate) => new RegExp(`^\\s+${escapeRegExp(candidate)}(?![\\w-])`, 'i').test(after))
    const end = model ? mention.end + (after.search(/\S/) + model.length) : mention.end

    return { make, model: model ?? null, year: mention.year, evidence: text.slice(mention.start, end) }
  }

  // Without a make, short or numeric model names ("ES", "1500") are too ambiguous to count.
  const models = Object.values(vehicleCatalog)
    .flat()
    .filter((model) => model.length > 2 && !/^\d+$/.test(model))
    .sort(byLongestName)

  for (const model of models) {
    const mention = findOwnedMention(text, model, '')
    if (mention) {
      return { make: null, model, year: mention.year, evidence: text.slice(mention.start, mention.end) }
    }
  }
  return null
}

function findMileage(text: string): ExtractedDetail | null {
  const match = mileagePattern.exec(text)
  if (!match?.[1] || !isStatedPlainly(text, match.index)) return null

  const raw = match[1].toLowerCase().replace(/\s/g, '')
  const miles = raw.endsWith('k') ? Math.round(Number.parseFloat(raw) * 1000) : Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(miles) || miles < 1000 || miles > 9_999_999) return null

  return { field: 'mileage', value: String(miles), evidence: match[0] }
}

function findFirstPattern<TValue extends string>(text: string, patterns: [TValue, RegExp][]) {
  for (const [value, pattern] of patterns) {
    const match = pattern.exec(text)
    if (match && isStatedPlainly(text, match.index)) {
      return { value, evidence: match[0] }
    }
  }
  return null
}

export function extractDetailsFromText(text: string): ExtractedDetail[] {
  const details: ExtractedDetail[] = []
  const vehicle = findVehicle(text)

  if (vehicle?.make) details.push({ field: 'make', value: vehicle.make, evidence: vehicle.evidence })
  if (vehicle?.model) details.push({ field: 'model', value: vehicle.model, evidence: vehicle.evidence })
  if (vehicle?.year) details.push({ field: 'year', value: vehicle.year, evidence: vehicle.evidence })

  const mileage = findMileage(text)
  if (mileage) details.push(mileage)

  const accident = findFirstPattern(text, accidentPatterns)
  if (accident) details.push({ field: 'accidentType', ...accident })

  const situation = findFirstPattern(text, situationPatterns)
  if (situation) details.push({ field: 'situation', ...situation })

  return details
}
