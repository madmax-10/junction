import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatImage } from '../types/chat.ts'

const megabyte = 1024 * 1024

type ImageAttachmentOptions = {
  maxImages: number
  maxFileSizeMb: number
}

let attachmentCount = 0

export function useImageAttachments({ maxImages, maxFileSizeMb }: ImageAttachmentOptions) {
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
      const images = candidates.filter((file) => file.type.startsWith('image/'))
      const withinSize = images.filter((file) => file.size <= maxFileSizeMb * megabyte)
      const openSlots = Math.max(maxImages - attachments.length, 0)
      const accepted = withinSize.slice(0, openSlots)

      if (images.length < candidates.length) {
        setError('Only image files can be added.')
      } else if (withinSize.length < images.length) {
        setError(`Photos need to be under ${maxFileSizeMb} MB each.`)
      } else if (accepted.length < withinSize.length) {
        setError(`You can add up to ${maxImages} photos per message.`)
      } else {
        setError(null)
      }

      if (accepted.length === 0) {
        return
      }

      const added = accepted.map((file) => {
        attachmentCount += 1
        const url = URL.createObjectURL(file)
        pendingUrls.current.add(url)
        return { id: `attachment-${attachmentCount}`, name: file.name, url }
      })
      setAttachments([...attachments, ...added])
    },
    [attachments, maxImages, maxFileSizeMb],
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
