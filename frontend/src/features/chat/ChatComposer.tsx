import { ArrowUp, ImageSquare, X } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { useImageAttachments } from '../../hooks/useImageAttachments.ts'
import { knownIssuePhoto } from '../../mocks/knownRecords.ts'
import { useScrollFade } from '../../hooks/useScrollFade.ts'
import type { ChatImage } from '../../types/chat.ts'

const maxImages = 8
const maxFileSizeMb = 5
const maxMessageLength = 2000
const maxTextareaHeight = 176

const thumbnailTransition = { duration: 0.2, ease: 'easeOut' } as const

type ChatComposerProps = {
  isResponding: boolean
  onSend: (text: string, images: ChatImage[]) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

function hasDraggedFiles(event: DragEvent<HTMLElement>) {
  return event.dataTransfer.types.includes('Files')
}

export function ChatComposer({ isResponding, onSend, textareaRef }: ChatComposerProps) {
  const [text, setText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { attachments, error, addFiles, removeAttachment, takeAttachments } = useImageAttachments({
    maxImages,
    maxFileSizeMb,
    issue: knownIssuePhoto,
  })
  const setThumbnailFadeElement = useScrollFade<HTMLUListElement>({ axis: 'x' })
  const setTextareaFadeElement = useScrollFade<HTMLTextAreaElement>()
  const setTextareaElement = useCallback(
    (node: HTMLTextAreaElement | null) => {
      textareaRef.current = node
      setTextareaFadeElement(node)
    },
    [textareaRef, setTextareaFadeElement],
  )

  const hasContent = text.trim().length > 0 || attachments.length > 0
  const canSend = hasContent && !isResponding
  const isAtImageLimit = attachments.length >= maxImages

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxTextareaHeight)}px`
  }, [text, textareaRef])

  function send() {
    if (!canSend) {
      return
    }
    onSend(text, takeAttachments())
    setText('')
    textareaRef.current?.focus()
  }

  function handleRemove(id: string) {
    removeAttachment(id)
    textareaRef.current?.focus()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    send()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      addFiles(event.target.files)
    }
    event.target.value = ''
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith('image/'),
    )
    if (images.length > 0) {
      event.preventDefault()
      addFiles(images)
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (hasDraggedFiles(event)) {
      event.preventDefault()
      setIsDragging(true)
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false)
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (hasDraggedFiles(event)) {
      event.preventDefault()
      setIsDragging(false)
      addFiles(event.dataTransfer.files)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="pointer-events-none px-3 pt-3 pb-3 sm:px-6 sm:pt-4 sm:pb-5"
    >
      <div className="pointer-events-auto mx-auto max-w-2xl">
        <div
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-3xl border bg-surface/75 shadow-card-hover backdrop-blur-xl transition-[border-color,box-shadow] duration-200 ease-out ${
            isDragging
              ? 'border-secondary ring-1 ring-secondary'
              : 'border-border focus-within:border-secondary focus-within:ring-1 focus-within:ring-secondary'
          }`}
        >
          <AnimatePresence initial={false}>
            {attachments.length > 0 && (
              <motion.ul
                key="attachments"
                aria-label="Photos to send"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={thumbnailTransition}
                ref={setThumbnailFadeElement}
                className="scroll-fade-x flex gap-2 overflow-x-auto px-3 pt-3"
              >
                <AnimatePresence initial={false}>
                  {attachments.map((attachment, index) => (
                    <motion.li
                      key={attachment.id}
                      layout
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={thumbnailTransition}
                      className="relative size-16 shrink-0 sm:size-[4.5rem]"
                    >
                      <img
                        src={attachment.url}
                        alt={`Photo ${index + 1}: ${attachment.name}`}
                        className="size-full rounded-xl border border-border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemove(attachment.id)}
                        aria-label={`Remove photo ${index + 1}: ${attachment.name}`}
                        className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-text/75 text-surface backdrop-blur-sm transition-colors duration-200 outline-none hover:bg-text focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>

          <label htmlFor="chat-input" className="sr-only">
            Describe what happened or ask a question
          </label>
          <textarea
            id="chat-input"
            ref={setTextareaElement}
            rows={1}
            value={text}
            maxLength={maxMessageLength}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Describe what happened…"
            aria-describedby="chat-input-hint"
            className="scroll-fade-y block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 [--fade-size:1.25rem] font-body text-[0.95rem] leading-relaxed outline-none placeholder:text-text/45"
          />

          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAtImageLimit}
                className="inline-flex h-10 items-center gap-2 rounded-full px-3 font-body text-sm font-medium text-muted transition-colors duration-200 outline-none hover:bg-secondary-light hover:text-secondary focus-visible:ring-2 focus-visible:ring-secondary disabled:pointer-events-none disabled:opacity-40"
              >
                <ImageSquare size={20} aria-hidden="true" />
                Add photos
              </button>
              {attachments.length > 0 && (
                <span className="font-body text-xs text-text/50 tabular-nums">
                  {attachments.length}/{maxImages}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSend}
              aria-label={isResponding ? 'Waiting for reply' : 'Send message'}
              className="grid size-10 place-items-center rounded-full bg-primary text-surface shadow-card transition-[background-color,transform,box-shadow] duration-200 ease-out outline-none hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95 disabled:pointer-events-none disabled:bg-text/10 disabled:text-text/40 disabled:shadow-none"
            >
              <ArrowUp size={18} weight="bold" aria-hidden="true" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileChange}
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
          />

          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={thumbnailTransition}
                className="pointer-events-none absolute inset-0 grid place-items-center rounded-3xl bg-secondary-light/95"
              >
                <span className="flex items-center gap-2 font-body text-sm font-semibold text-secondary">
                  <ImageSquare size={20} aria-hidden="true" />
                  Drop photos to add them
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p id="chat-input-hint" aria-live="polite" className="mt-2 px-2 font-body text-xs text-danger empty:mt-0">
          {error}
        </p>
      </div>
    </form>
  )
}
