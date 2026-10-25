import type { StoryPreview } from '../types/story.ts'
import { experiencesByTopic, type ChatTopic } from './communityExperiences.ts'

// Canned replies for the chat preview. Nothing here is generated or analyzed.

type MockReply = {
  text: string
  stories: StoryPreview[]
  followUps: string[]
}

type MockReplyInput = {
  text: string
  imageCount: number
  isFirstReply: boolean
  vehicleName: string | null
}

const topicPatterns: [ChatTopic, RegExp][] = [
  ['total-loss', /total(ed)?\b|total loss|write[- ]?off|salvage|payout/i],
  ['weather', /hail|flood|storm|\btrees?\b|branch|weather/i],
  ['sell', /\bsell|\bsold|trade[- ]?in|dealer|as[- ]?is|private(ly)? (sale|buyer)/i],
  ['insurance', /insur|adjuster|claim|settle|deductible|offer/i],
  ['repair', /repair|estimate|body shop|fix|bumper|frame|dent|rear[- ]?end|scratch/i],
]

const replies: Record<ChatTopic, Omit<MockReply, 'stories'>> = {
  repair: {
    text: 'A repair estimate is a solid starting point. People in a similar spot usually weighed three things: the estimate against what the car is worth, whether the damage reached the frame, and how long they planned to keep the car.\n\nHere are a few owners whose situations look close to yours.',
    followUps: [
      'Is it worth repairing if the estimate is close to the car’s value?',
      'How did people choose a body shop?',
      'Did anyone get a second estimate?',
    ],
  },
  'total-loss': {
    text: 'A total loss call can feel sudden. Many people in this spot compared the insurer’s offer with local listings for the same model, year, and mileage before they accepted.\n\nThese owners went through it and shared how it turned out.',
    followUps: [
      'How did people negotiate a higher payout?',
      'Can I keep my car after a total loss?',
      'What did people replace their car with?',
    ],
  },
  sell: {
    text: 'Selling a damaged car is more common than it sounds. Most people chose between selling as-is to a dealer, selling privately, or trading it in toward something new.\n\nHere’s how a few of those choices played out.',
    followUps: [
      'Did people get more selling privately?',
      'Should I repair before selling?',
      'How do instant cash offers compare?',
    ],
  },
  insurance: {
    text: 'Insurance conversations go smoother when you know what others ran into. A common thread: people who kept records and asked for the valuation in writing felt more in control.\n\nThese experiences might help you prepare.',
    followUps: [
      'What should I ask the adjuster?',
      'Did anyone dispute an offer?',
      'How long did settlements take?',
    ],
  },
  weather: {
    text: 'Weather damage often goes through a different part of your policy than a collision, so the path can look different. Here’s what owners with hail, flood, and storm damage shared.',
    followUps: [
      'Did paintless dent repair work for hail?',
      'What happens to flood-damaged cars?',
      'Did a weather claim raise anyone’s premium?',
    ],
  },
  general: {
    text: 'Thanks for sharing that. To find people whose experience matches yours, it helps to know what kind of accident it was and where things stand, like whether you have a repair estimate or a total loss decision.\n\nIn the meantime, here are a few experiences that come up often.',
    followUps: [
      'I have a repair estimate',
      'My insurer declared a total loss',
      'I’m thinking about selling my car',
    ],
  },
}

function detectTopic(text: string): ChatTopic {
  return topicPatterns.find(([, pattern]) => pattern.test(text))?.[0] ?? 'general'
}

export function createMockReply({ text, imageCount, isFirstReply, vehicleName }: MockReplyInput): MockReply {
  const topic = detectTopic(text)
  const reply = replies[topic]
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
    text: [...intro, reply.text].join('\n\n'),
    stories: experiencesByTopic[topic],
    followUps: reply.followUps.filter((followUp) => followUp.toLowerCase() !== normalizedText),
  }
}
