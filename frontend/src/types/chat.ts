import type { DetailSuggestion } from './extraction.ts'
import type { StoryMatch, StoryMatchStatus } from './story.ts'

export type ChatImage = {
  id: string
  name: string
  url: string
}

export type ChatMessage =
  | {
      id: string
      role: 'user'
      text: string
      images: ChatImage[]
      suggestions: DetailSuggestion[]
    }
  | {
      id: string
      role: 'assistant'
      text: string
      matchStatus: StoryMatchStatus
      matches: StoryMatch[]
      followUps: string[]
    }

export type ExampleQuestion = {
  id: string
  text: string
}
