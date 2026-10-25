import { useEffect, useState } from 'react'
import { getIssuePhotoBlob, listIssuePhotos } from '../../services/posts.ts'
import type { PostIssueType } from '../../types/post.ts'

export type LoadedIssuePhoto = { filename: string; path: string; url: string }

type IssuePhotosState = {
  status: 'loading' | 'ready' | 'error'
  photos: LoadedIssuePhoto[]
}

// Draft photos are private, so they are fetched with the session token and shown as object URLs.
export function useIssuePhotos(issueType: PostIssueType, issueId: string) {
  const [state, setState] = useState<IssuePhotosState>({ status: 'loading', photos: [] })

  useEffect(() => {
    let current = true
    const urls: string[] = []
    void (async () => {
      try {
        const listed = await listIssuePhotos(issueType, issueId)
        const loaded = await Promise.all(
          listed.map(async (photo) => {
            try {
              const blob = await getIssuePhotoBlob(issueType, issueId, photo.filename)
              if (!current) return []
              const url = URL.createObjectURL(blob)
              urls.push(url)
              return [{ ...photo, url }]
            } catch {
              return []
            }
          }),
        )
        if (current) setState({ status: 'ready', photos: loaded.flat() })
      } catch {
        if (current) setState({ status: 'error', photos: [] })
      }
    })()
    return () => {
      current = false
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [issueType, issueId])

  return state
}
