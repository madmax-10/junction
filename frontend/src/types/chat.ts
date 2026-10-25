import type { StoryPreview } from './story.ts'

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
    }
  | {
      id: string
      role: 'assistant'
      text: string
      stories: StoryPreview[]
      followUps: string[]
    }

export type ExampleQuestion = {
  id: string
  text: string
}
