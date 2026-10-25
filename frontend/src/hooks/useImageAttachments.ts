import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatImage } from '../types/chat.ts'

const megabyte = 1024 * 1024
const extensions = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

type IssuePhotoTarget = {
  type: string
  id: string
  existingCount: number
}

type ImageAttachmentOptions = {
  maxImages: number
  maxFileSizeMb: number
  issue: IssuePhotoTarget | null
}

let nextPhotoIndex = 0

let attachmentCount = 0

export function useImageAttachments({ maxImages, maxFileSizeMb, issue }: ImageAttachmentOptions) {
  const [attachments, setAttachments] = useState<ChatImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const pendingUrls = useRef(new Set<string>())

  useEffect(() => {
    const urls = pendingUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const addFiles = useCallback(
    (files: Iterable<File>) => {
      const candidates = Array.from(files)
      const images = candidates.filter((file) => extensions.has(file.type))
      const withinSize = images.filter((file) => file.size <= maxFileSizeMb * megabyte)
      const openSlots = Math.max(maxImages - attachments.length, 0)
      const accepted = withinSize.slice(0, openSlots)

      if (images.length < candidates.length) {
        setError('Photo must be a JPEG, PNG, or WebP image.')
      } else if (withinSize.length < images.length) {
        setError(`Photos need to be under ${maxFileSizeMb} MB each.`)
      } else if (accepted.length < withinSize.length) {
        setError(`An issue can have at most ${maxImages} photos.`)
      } else {
        setError(null)
      }

      if (accepted.length === 0) {
        return
      }

      const added = accepted.map((file) => {
        attachmentCount += 1
        const extension = extensions.get(file.type) ?? 'jpg'
        const index = Math.max(nextPhotoIndex, issue?.existingCount ?? 0) + 1
        nextPhotoIndex = index
        const filename = issue ? `${issue.id}_${index}.${extension}` : file.name
        const url = URL.createObjectURL(file)
        pendingUrls.current.add(url)
        return {
          id: `attachment-${attachmentCount}`,
          name: file.name,
          url,
          filename,
          path: issue ? `issues/${issue.type}/${issue.id}/${filename}` : null,
        }
      })
      setAttachments([...attachments, ...added])
    },
    [attachments, issue, maxImages, maxFileSizeMb],
  )

  const removeAttachment = useCallback(
    (id: string) => {
      const removed = attachments.find((attachment) => attachment.id === id)
      if (removed) {
        URL.revokeObjectURL(removed.url)
        pendingUrls.current.delete(removed.url)
      }
      setAttachments(attachments.filter((attachment) => attachment.id !== id))
      setError(null)
    },
    [attachments],
  )

  // Hands the previews to the conversation, which keeps their URLs alive.
  const takeAttachments = useCallback(() => {
    attachments.forEach((attachment) => pendingUrls.current.delete(attachment.url))
    setAttachments([])
    setError(null)
    return attachments
  }, [attachments])

  return { attachments, error, addFiles, removeAttachment, takeAttachments }
}
