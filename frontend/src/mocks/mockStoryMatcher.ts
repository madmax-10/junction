import type { AccidentType, CurrentSituation, IntakeDraft } from '../types/intake.ts'
import type {
  ClaimPath,
  CommunityStory,
  DamageArea,
  DamageSeverity,
  StoryDecision,
  StoryMatch,
  StoryMatchQuery,
} from '../types/story.ts'
import { communityStories } from './communityExperiences.ts'
import { extractDetailsFromText } from './mockSituationExtractor.ts'

// Keyword scoring standing in for real retrieval. A story is only relevant when it shares part of
// the accident or claim itself; vehicle similarity alone can reorder matches but never create one.

type SituationProfile = {
  accidentType: AccidentType | null
  situation: CurrentSituation | null
  make: string | null
  model: string | null
  year: number | null
  mileage: number | null
  claimPath: ClaimPath | null
  severity: DamageSeverity | null
  damage: DamageArea[]
  interests: StoryDecision[]
}

type MatchSignal = {
  weight: number
  reason: string
  isSituational: boolean
}

const minimumScore = 2
const relativeCutoff = 0.3
const reasonLimit = 3

const emptyProfile: SituationProfile = {
  accidentType: null,
  situation: null,
  make: null,
  model: null,
  year: null,
  mileage: null,
  claimPath: null,
  severity: null,
  damage: [],
  interests: [],
}

// Ordered from most to least specific, so the first shared area makes the clearest reason.
const damagePatterns: [DamageArea, RegExp][] = [
  ['frame', /\b(?:frame|unibody|structural)\b/i],
  ['airbags', /\bair ?bags?\b/i],
  ['roof', /\b(?:roof|sunroof|moonroof)\b/i],
  ['side', /\b(?:doors?|quarter panel|fender|pillar|(?:driver|passenger)['’]?s? side)\b/i],
  ['hood', /\bhood\b/i],
  ['front-end', /\b(?:front bumper|front end|headlights?|grille|radiator)\b/i],
  ['rear', /\b(?:rear bumper|back bumper|rear end|back end|trunk|tailgate|liftgate|tail ?lights?)\b/i],
]

const decisionPatterns: [StoryDecision, RegExp][] = [
  ['repaired', /\b(?:repair(?:ed|ing|s)?|fix(?:ed|ing)?|body shop|paintless)\b(?!\s+(?:estimate|quote))/i],
  ['sold', /\b(?:sell(?:ing)?|sold|trade[- ]?in|as[- ]is)\b/i],
  [
    'replaced',
    /\b(?:replac(?:e|ed|ing)\s+(?:my |the |our )?(?:car|vehicle)|replacement (?:car|vehicle)|(?:new|another|different) car|mov(?:e|ing) on)\b/i,
  ],
  ['insurance-settlement', /\b(?:negotiat\w*|payout|settle\w*|offers?|lowball\w*|push(?:ed)? back|dispute\w*)\b/i],
]

const claimPatterns: [ClaimPath, RegExp][] = [
  [
    'other-driver',
    /\b(?:(?:other (?:driver|party|guy|person)['’]?s?|their|at[- ]fault (?:driver|party)['’]?s?)\s+(?:insurance|insurer|adjuster|policy)|(?:wasn['’]?t|not) my fault)\b/i,
  ],
  ['own-policy', /\b(?:my (?:own )?(?:insurance|insurer|policy|adjuster)|collision coverage|comprehensive|deductible|my fault)\b/i],
]

const severityPatterns: [DamageSeverity, RegExp][] = [
  ['severe', /\b(?:frame|air ?bags?|not driv(?:e)?able|undriv(?:e)?able|towed|crushed)\b/i],
  ['minor', /\b(?:scratch(?:es|ed)?|scuffs?|minor|cosmetic|small dents?)\b/i],
]

const accidentReasons: Record<CommunityStory['accident']['type'], string> = {
  'rear-end': 'Rear-end collision',
  'front-collision': 'Front collision',
  'side-impact': 'Side impact',
  'weather-damage': 'Weather damage',
}

const situationReasons: Record<CommunityStory['claim']['status'], string> = {
  'repair-estimate': 'Repair estimate in hand',
  'total-loss': 'Declared a total loss',
}

const damageReasons: Record<DamageArea, string> = {
  frame: 'Frame damage',
  airbags: 'Airbags deployed',
  roof: 'Roof damage',
  side: 'Side damage',
  hood: 'Hood damage',
  'front-end': 'Front-end damage',
  rear: 'Rear damage',
}

const decisionReasons: Record<StoryDecision, string> = {
  repaired: 'Repair decision',
  sold: 'Sale decision',
  replaced: 'Replacement decision',
  'insurance-settlement': 'Settlement negotiation',
}

const claimReasons: Record<ClaimPath, string> = {
  'other-driver': 'Other driver’s insurer',
  'own-policy': 'Own insurance claim',
}

const severityReasons: Record<DamageSeverity, string> = {
  minor: 'Minor damage',
  moderate: 'Moderate damage',
  severe: 'Severe damage',
}

function findAll<TValue>(text: string, patterns: [TValue, RegExp][]) {
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([value]) => value)
}

function findFirst<TValue>(text: string, patterns: [TValue, RegExp][]) {
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null
}

function toNumber(value: string | null) {
  const number = Number(value)
  return value && Number.isFinite(number) ? number : null
}

function withArticle(name: string) {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`
}

function profileFromText(text: string): SituationProfile {
  const profile: SituationProfile = {
    ...emptyProfile,
    claimPath: findFirst(text, claimPatterns),
    severity: findFirst(text, severityPatterns),
    damage: findAll(text, damagePatterns),
    interests: findAll(text, decisionPatterns),
  }

  for (const detail of extractDetailsFromText(text)) {
    switch (detail.field) {
      case 'accidentType':
        profile.accidentType = detail.value
        break
      case 'situation':
        profile.situation = detail.value
        break
      case 'make':
        profile.make = detail.value
        break
      case 'model':
        profile.model = detail.value
        break
      case 'year':
        profile.year = toNumber(detail.value)
        break
      case 'mileage':
        profile.mileage = toNumber(detail.value)
        break
    }
  }
  return profile
}

function profileFromDraft({ accidentType, situation, vehicle, interests }: IntakeDraft): SituationProfile {
  return {
    ...emptyProfile,
    accidentType,
    situation,
    make: vehicle.make,
    model: vehicle.model,
    year: toNumber(vehicle.year),
    mileage: toNumber(vehicle.mileage),
    interests: interests.filter((interest): interest is StoryDecision => interest !== 'not-sure'),
  }
}

// Later sources win for single values; a newly named vehicle replaces the earlier one as a whole.
function mergeProfiles(base: SituationProfile, next: SituationProfile): SituationProfile {
  const vehicle = next.make || next.model ? next : base
  return {
    accidentType: next.accidentType ?? base.accidentType,
    situation: next.situation ?? base.situation,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    mileage: next.mileage ?? base.mileage,
    claimPath: next.claimPath ?? base.claimPath,
    severity: next.severity ?? base.severity,
    damage: [...new Set([...base.damage, ...next.damage])],
    interests: [...new Set([...base.interests, ...next.interests])],
  }
}

function getVehicleSignals(story: CommunityStory, profile: SituationProfile): MatchSignal[] {
  const { vehicle } = story
  const signals: MatchSignal[] = []
  const sameMake = profile.make?.toLowerCase() === vehicle.make.toLowerCase()
  const sameModel = profile.model?.toLowerCase() === vehicle.model.toLowerCase()

  if (sameModel) {
    signals.push({ weight: 3, reason: `Also ${withArticle(`${vehicle.make} ${vehicle.model}`)}`, isSituational: false })
  } else if (sameMake) {
    signals.push({ weight: 1, reason: `Also ${withArticle(vehicle.make)}`, isSituational: false })
  }
  if (profile.year !== null && Math.abs(profile.year - vehicle.year) <= 3) {
    signals.push({ weight: 1, reason: 'Similar model year', isSituational: false })
  }
  if (profile.mileage !== null && Math.abs(profile.mileage - vehicle.mileage) <= 25_000) {
    signals.push({ weight: 1, reason: 'Similar mileage', isSituational: false })
  }
  return signals
}

function scoreStory(story: CommunityStory, profile: SituationProfile): StoryMatch | null {
  const { accident, claim, topics } = story
  const signals: MatchSignal[] = []

  if (profile.accidentType === accident.type) {
    signals.push({ weight: 5, reason: accidentReasons[accident.type], isSituational: true })
  }
  if (profile.situation === claim.status) {
    signals.push({ weight: 3, reason: situationReasons[claim.status], isSituational: true })
  }

  const sharedDamage = damagePatterns
    .map(([area]) => area)
    .filter((area) => profile.damage.includes(area) && accident.damage.includes(area))
  if (sharedDamage[0]) {
    signals.push({
      weight: Math.min(sharedDamage.length, 2) * 2,
      reason: damageReasons[sharedDamage[0]],
      isSituational: true,
    })
  }

  const sharedTopic = profile.interests.find((interest) => topics.includes(interest))
  if (sharedTopic) {
    signals.push({ weight: 2, reason: decisionReasons[sharedTopic], isSituational: true })
  }
  if (profile.claimPath === claim.path) {
    signals.push({ weight: 1, reason: claimReasons[claim.path], isSituational: true })
  }
  if (profile.severity === accident.severity) {
    signals.push({ weight: 1, reason: severityReasons[accident.severity], isSituational: false })
  }
  signals.push(...getVehicleSignals(story, profile))

  if (!signals.some((signal) => signal.isSituational)) {
    return null
  }

  return {
    story,
    score: signals.reduce((total, signal) => total + signal.weight, 0),
    reasons: signals
      .toSorted((a, b) => b.weight - a.weight)
      .slice(0, reasonLimit)
      .map((signal) => signal.reason),
  }
}

export function matchSampleStories({ message, situation, limit }: StoryMatchQuery): StoryMatch[] {
  const profile = [
    profileFromText(`${situation.details}\n${situation.question}`),
    profileFromDraft(situation),
    profileFromText(message),
  ].reduce(mergeProfiles)

  const scored = communityStories
    .map((story) => scoreStory(story, profile))
    .filter((match): match is StoryMatch => match !== null)
    .toSorted((a, b) => b.score - a.score)

  const cutoff = Math.max(minimumScore, (scored[0]?.score ?? 0) * relativeCutoff)
  return scored.filter((match) => match.score >= cutoff).slice(0, limit)
}
