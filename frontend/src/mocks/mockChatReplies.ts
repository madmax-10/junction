import type { StoryMatchStatus } from '../types/story.ts'

// Canned replies for the chat preview. They introduce retrieved stories and never advise a decision.

type MockReply = {
  text: string
  followUps: string[]
}

type MockReplyInput = {
  text: string
  imageCount: number
  isFirstReply: boolean
  vehicleName: string | null
  matchStatus: StoryMatchStatus
  matchCount: number
}

type ChatTopic = 'repair' | 'total-loss' | 'sell' | 'insurance' | 'weather' | 'general'

const topicPatterns: [ChatTopic, RegExp][] = [
  ['total-loss', /total(ed)?\b|total loss|write[- ]?off|salvage|payout/i],
  ['weather', /hail|flood|storm|\btrees?\b|branch|weather/i],
  ['sell', /\bsell|\bsold|trade[- ]?in|dealer|as[- ]?is|private(ly)? (sale|buyer)/i],
  ['insurance', /insur|adjuster|claim|settle|deductible|offer/i],
  ['repair', /repair|estimate|body shop|fix|bumper|frame|dent|rear[- ]?end|scratch/i],
]

const followUpsByTopic: Record<ChatTopic, string[]> = {
  repair: [
    'Is it worth repairing if the estimate is close to the car’s value?',
    'How did people choose a body shop?',
    'Did anyone get a second estimate?',
  ],
  'total-loss': [
    'How did people negotiate a higher payout?',
    'Can I keep my car after a total loss?',
    'What did people replace their car with?',
  ],
  sell: ['Did people get more selling privately?', 'Should I repair before selling?', 'How do instant cash offers compare?'],
  insurance: ['What should I ask the adjuster?', 'Did anyone dispute an offer?', 'How long did settlements take?'],
  weather: [
    'Did paintless dent repair work for hail?',
    'What happens to flood-damaged cars?',
    'Did a weather claim raise anyone’s premium?',
  ],
  general: ['I have a repair estimate', 'My insurer declared a total loss', 'I’m thinking about selling my car'],
}

const countWords = ['no', 'one', 'two', 'three', 'four', 'five']

const noMatchText =
  'I couldn’t find a community story close enough to your situation, so I won’t show ones that don’t fit.\n\nIf you share what happened, where your car was damaged, or where things stand with insurance, I can look again.'

const unavailableText = 'I couldn’t reach the community stories just now. Please try sending that again in a moment.'

function detectTopic(text: string): ChatTopic {
  return topicPatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? 'general'
}

function introduceMatches(count: number) {
  if (count === 1) {
    return 'I found one owner whose situation overlaps with yours. Here’s what they decided and what they reported afterward.'
  }
  return `Here are ${countWords[count] ?? count} owners whose situations overlap with yours, with what each decided and what they reported afterward.`
}

function getReplyBody(matchStatus: StoryMatchStatus, matchCount: number) {
  if (matchStatus === 'matched') return introduceMatches(matchCount)
  if (matchStatus === 'no-match') return noMatchText
  return unavailableText
}

function getFollowUps(matchStatus: StoryMatchStatus, text: string) {
  if (matchStatus === 'unavailable') return []
  return followUpsByTopic[matchStatus === 'no-match' ? 'general' : detectTopic(text)]
}

export function createMockReply({
  text,
  imageCount,
  isFirstReply,
  vehicleName,
  matchStatus,
  matchCount,
}: MockReplyInput): MockReply {
  const intro: string[] = []

  if (imageCount > 0) {
    const photos = imageCount === 1 ? 'the photo' : `the ${imageCount} photos`
    intro.push(
      `Thanks for ${photos}. Photo review isn’t available in this preview, so I’m going by your description for now.`,
    )
  }
  if (isFirstReply && vehicleName) {
    intro.push(`I’ll keep your ${vehicleName} in mind as we go.`)
  }

  const normalizedText = text.trim().toLowerCase()

  return {
    text: [...intro, getReplyBody(matchStatus, matchCount)].join('\n\n'),
    followUps: getFollowUps(matchStatus, text).filter((followUp) => followUp.toLowerCase() !== normalizedText),
  }
}
