import { ArrowRight, CheckCircle, EyeSlash, PencilSimple, PaperPlaneTilt, ShieldCheck } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { getListingPath, getStoryPath } from '../../app/paths.ts'
import { Button } from '../../components/ui/Button.tsx'
import { ApiError } from '../../services/api.ts'
import { getPostDraft, updatePostDraft } from '../../services/posts.ts'
import type { PostDraft } from '../../types/post.ts'
import { useChat } from './ChatContext.ts'
import { PostDraftForm } from './PostDraftForm.tsx'
import { fromPostForm, toPostForm, type PostForm, type PostFormErrors } from './postDraftForm.ts'
import { postTypeMeta } from './postDraftOptions.tsx'
import { PostDraftPreview } from './PostDraftPreview.tsx'
import { useIssuePhotos } from './useIssuePhotos.ts'

type Phase = 'review' | 'editing' | 'publishing' | 'published' | 'dismissed' | 'missing'

const cardTransition = { duration: 0.25, ease: 'easeOut' } as const

function publishedPath(post: PostDraft) {
  if (post.issueType === 'sell') return getListingPath(post.id)
  if (post.issueType === 'repair') return getStoryPath(post.id)
  return null
}

function approvalNote(post: PostDraft, edited: boolean) {
  return [
    `Post approval: I reviewed draft post ${post.id} (${post.issueType} issue ${post.issueId}) in the review card and I clearly approve publishing this exact draft now.`,
    edited ? 'I edited it in the review card. The saved draft already has my changes, so publish it as it is.' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function PostReviewCard({ initialPost }: { initialPost: PostDraft }) {
  const { sendMessage, isResponding } = useChat()
  const [post, setPost] = useState(initialPost)
  const [phase, setPhase] = useState<Phase>(initialPost.status === 'published' ? 'published' : 'review')
  const [form, setForm] = useState<PostForm>(() => toPostForm(initialPost))
  const [errors, setErrors] = useState<PostFormErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const edited = useRef(false)
  const sawReply = useRef(false)
  const photos = useIssuePhotos(post.issueType, post.issueId)
  const photoUrls = useMemo(() => new Map(photos.photos.map((photo) => [photo.path, photo.url])), [photos.photos])
  const meta = postTypeMeta[post.issueType]
  const idPrefix = `post-${post.id}`

  // The chat history can be older than the saved post, so show what the server has now.
  useEffect(() => {
    let current = true
    getPostDraft(initialPost.id)
      .then((fresh) => {
        if (!current || !fresh) return
        setPost(fresh)
        if (fresh.status === 'published') setPhase((value) => (value === 'review' ? 'published' : value))
        if (fresh.status === 'archived') setPhase('missing')
      })
      .catch((reason: unknown) => {
        if (current && reason instanceof ApiError && reason.status === 404) setPhase('missing')
      })
    return () => {
      current = false
    }
  }, [initialPost.id])

  // After the approval message is answered, check whether the assistant actually published the post.
  useEffect(() => {
    if (phase !== 'publishing') return
    if (isResponding) {
      sawReply.current = true
      return
    }
    if (!sawReply.current) return
    sawReply.current = false
    let current = true
    getPostDraft(post.id)
      .then((fresh) => {
        if (!current || !fresh) return
        setPost(fresh)
        if (fresh.status === 'published') {
          setPhase('published')
        } else {
          setPhase('review')
          setNotice('It hasn’t been posted yet. Check the assistant’s reply above, then confirm again.')
        }
      })
      .catch(() => {
        if (!current) return
        setPhase('review')
        setError('Couldn’t check whether the post went live. Please try again.')
      })
    return () => {
      current = false
    }
  }, [phase, isResponding, post.id])

  function startEditing() {
    setForm(toPostForm(post))
    setErrors({})
    setError(null)
    setNotice(null)
    setPhase('editing')
  }

  async function saveChanges() {
    const result = fromPostForm(post.issueType, form)
    setErrors(result.errors)
    if (!result.isValid) {
      setError('Fix the highlighted fields first.')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const updated = await updatePostDraft(post.id, {
        title: form.title.trim(),
        content: form.content.trim(),
        post_data: result.postData,
      })
      setPost(updated)
      edited.current = true
      setNotice('Your changes are saved to the draft.')
      setPhase('review')
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Your changes couldn’t be saved. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  function confirmAndPost() {
    if (isResponding) return
    setError(null)
    setNotice(null)
    sawReply.current = false
    setPhase('publishing')
    sendMessage('Yes, post it.', [], approvalNote(post, edited.current))
  }

  if (phase === 'missing') {
    return (
      <p className="mt-3 flex items-center gap-1.5 font-body text-xs font-medium text-muted">
        <EyeSlash size={16} aria-hidden="true" />
        This draft is no longer available.
      </p>
    )
  }

  if (phase === 'published') {
    const path = publishedPath(post)
    return (
      <motion.section
        aria-label="Post published"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={cardTransition}
        className="mt-3 flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary-light/60 px-4 py-3"
      >
        <p className="flex min-w-0 items-center gap-2 font-body text-sm">
          <CheckCircle size={20} weight="fill" className="shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-semibold">{meta.postedLabel}.</span>{' '}
            <span className="text-muted">“{post.title}”</span>
          </span>
        </p>
        {path && (
          <Link
            to={path}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-body text-sm font-semibold text-primary transition-colors duration-200 outline-none hover:bg-primary-light focus-visible:ring-2 focus-visible:ring-primary"
          >
            View post
            <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </Link>
        )}
      </motion.section>
    )
  }

  if (phase === 'dismissed') {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-xs text-muted">
        <EyeSlash size={16} aria-hidden="true" />
        Kept as a private draft. Nothing was posted.
        <button
          type="button"
          onClick={() => setPhase('review')}
          className="rounded-full px-2 py-1 font-semibold text-secondary transition-colors duration-200 outline-none hover:bg-secondary-light focus-visible:ring-2 focus-visible:ring-secondary"
        >
          Review again
        </button>
      </p>
    )
  }

  const isPublishing = phase === 'publishing'
  const isEditing = phase === 'editing'

  return (
    <motion.section
      aria-labelledby={`${idPrefix}-heading`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={cardTransition}
      className="mt-3 max-w-xl rounded-3xl border border-secondary/15 bg-secondary-light/60 p-3 sm:p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h3 id={`${idPrefix}-heading`} className="flex items-center gap-1.5 font-body text-sm font-semibold text-secondary">
            {meta.icon}
            {isEditing ? `Edit your ${meta.label.toLowerCase()}` : `Post this ${meta.label.toLowerCase()}?`}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 font-body text-xs text-muted">
            <ShieldCheck size={14} aria-hidden="true" />
            Private draft. It goes to {meta.destination} only when you confirm.
          </p>
        </div>
      </header>

      <div className="mt-3">
        {isEditing ? (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <PostDraftForm
              idPrefix={idPrefix}
              issueType={post.issueType}
              form={form}
              errors={errors}
              photos={photos}
              disabled={isSaving}
              onChange={(changes) => setForm((current) => ({ ...current, ...changes }))}
            />
          </div>
        ) : (
          <PostDraftPreview post={post} photoUrls={photoUrls} />
        )}
      </div>

      {(error || notice) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`mt-3 px-1 font-body text-xs font-medium ${error ? 'text-danger' : 'text-secondary'}`}
        >
          {error ?? notice}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isEditing ? (
          <>
            <Button onClick={() => void saveChanges()} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="secondary" onClick={() => setPhase('review')} disabled={isSaving}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button onClick={confirmAndPost} disabled={isPublishing || isResponding}>
              <PaperPlaneTilt size={16} weight="bold" aria-hidden="true" />
              {isPublishing ? 'Posting…' : 'Confirm and post'}
            </Button>
            <Button variant="secondary" onClick={startEditing} disabled={isPublishing}>
              <PencilSimple size={16} aria-hidden="true" />
              Edit details
            </Button>
            <button
              type="button"
              onClick={() => setPhase('dismissed')}
              disabled={isPublishing}
              className="ml-auto rounded-full px-3 py-2 font-body text-sm font-medium text-muted transition-colors duration-200 outline-none hover:bg-secondary-light hover:text-text focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
            >
              Not now
            </button>
          </>
        )}
      </div>
    </motion.section>
  )
}
