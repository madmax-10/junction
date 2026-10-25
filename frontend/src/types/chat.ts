import type { DetailSuggestion } from './extraction.ts'
import type { StoryMatch, StoryMatchStatus } from './story.ts'

// A chat thumbnail is an issue photo. `path` is set once the issue id is known.
export type ChatImage = {
  id: string
  name: string
  url: string
  filename: string
  path: string | null
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
