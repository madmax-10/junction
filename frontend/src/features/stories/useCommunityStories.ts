import { useCallback, useEffect, useState } from 'react'
import { getCommunityStories } from '../../services/communityStories.ts'
import type { CommunityStory } from '../../types/story.ts'

type StoriesState =
  | { status: 'loading'; stories: [] }
  | { status: 'ready'; stories: CommunityStory[] }
  | { status: 'error'; stories: [] }

export function useCommunityStories() {
  const [state, setState] = useState<StoriesState>({ status: 'loading', stories: [] })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let isCurrent = true
    getCommunityStories().then(
      (stories) => isCurrent && setState({ status: 'ready', stories }),
      () => isCurrent && setState({ status: 'error', stories: [] }),
    )
    return () => {
      isCurrent = false
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading', stories: [] })
    setAttempt((current) => current + 1)
  }, [])

  return { ...state, retry }
}
