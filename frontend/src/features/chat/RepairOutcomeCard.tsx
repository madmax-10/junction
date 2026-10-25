import { ArrowRight, CheckCircle, EyeSlash, Info, PencilSimple, ShieldCheck, Sparkle, Wrench } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { getStoryPath } from '../../app/paths.ts'
import { Button } from '../../components/ui/Button.tsx'
import { Field } from '../../components/ui/Field.tsx'
import { fieldClassName } from '../../components/ui/fieldStyles.ts'
import { ApiError } from '../../services/api.ts'
import { findRepairPost, getRepairOutcome, saveRepairOutcome } from '../../services/repairOutcome.ts'
import type { PostDraft } from '../../types/post.ts'
import type { RepairOutcomePrompt, RepairOutcomeStatus, RepairResolution } from '../../types/repair.ts'
import { formatPrice } from '../marketplace/marketplaceOptions.tsx'
import { useChat } from './ChatContext.ts'
import {
  fromOutcomeForm,
  outcomeLimits,
  toOutcomeForm,
  type RepairOutcomeErrors,
  type RepairOutcomeForm,
} from './repairOutcomeForm.ts'

type Phase = 'loading' | 'form' | 'ready' | 'requesting' | 'draft' | 'published' | 'saved-unresolved' | 'dismissed' | 'missing'

const cardTransition = { duration: 0.25, ease: 'easeOut' } as const

const statusOptions: { value: RepairOutcomeStatus; label: string }[] = [
  { value: 'resolved', label: 'Yes, it’s fixed' },
  { value: 'unresolved', label: 'Not yet' },
  { value: 'unsure', label: 'Not sure' },
]

const methodOptions: { value: RepairOutcomeForm['method']; label: string }[] = [
  { value: 'mechanic', label: 'A mechanic or shop' },
  { value: 'self', label: 'I did it myself' },
]

function namingLine(resolution: RepairResolution, nameMechanic: boolean) {
  if (resolution.method === 'self') return 'I did the repair myself.'
  if (!resolution.mechanic_name) return 'I did not give a mechanic or shop name.'
  if (!nameMechanic) return 'I prefer not to name who fixed it.'
  const place = resolution.location ? ` in ${resolution.location}` : ''
  return `I agree to name who fixed it: "${resolution.mechanic_name}"${place}.`
}

function draftRequestNote(issueId: string, resolution: RepairResolution, nameMechanic: boolean) {
  return [
    `Share repair outcome: the outcome of my repair issue ${issueId} is already saved and the issue is resolved, so do not record it again.`,
    `Please draft a private community story post for repair issue ${issueId} now and show it to me for review. Do not publish it yet.`,
    'Contact details to publish: none.',
    namingLine(resolution, nameMechanic),
  ].join(' ')
}

function showDraftNote(issueId: string, post: PostDraft) {
  return `Please show my existing draft community story post ${post.id} for repair issue ${issueId} again, unchanged, so I can review it. Do not publish it yet.`
}

function ChoiceGroup<T extends string>({
  name,
  legend,
  value,
  options,
  disabled,
  onChange,
}: {
  name: string
  legend: string
  value: T
  options: { value: T; label: string }[]
  disabled: boolean
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="font-body text-sm font-medium">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`inline-flex h-10 cursor-pointer items-center rounded-full border px-4 font-body text-sm transition-colors duration-200 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-primary ${value === option.value ? 'border-primary bg-primary-light font-semibold text-primary' : 'border-border bg-surface hover:border-primary/35'}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              disabled={disabled}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function OutcomeSummary({ resolution, children }: { resolution: RepairResolution; children?: ReactNode }) {
  const fix = resolution.method === 'mechanic' ? resolution.work_performed : resolution.instructions
  const fixedBy = resolution.method === 'self' ? 'I did it myself' : resolution.mechanic_name || 'A mechanic or shop'
  const facts = [
    { label: 'Fixed by', value: fixedBy },
    { label: 'Where', value: resolution.method === 'mechanic' ? resolution.location : undefined },
    { label: 'Cost', value: resolution.cost !== undefined ? formatPrice(resolution.cost) : undefined },
    { label: 'Parts used', value: resolution.parts_used?.join(', ') },
    { label: 'Insurance', value: resolution.insurance_settlement },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value))

  return (
    <article className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <p className="font-body text-xs font-medium tracking-wide text-muted uppercase">What fixed it</p>
      <p className="mt-1 font-heading text-base leading-snug font-bold break-words">{fix}</p>
      {facts.length > 0 && (
        <dl className="mt-4 grid gap-x-4 gap-y-2 border-t border-border pt-4 font-body text-sm sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-xs text-muted">{fact.label}</dt>
              <dd className="break-words">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      <p className="mt-4 flex items-start gap-1.5 rounded-xl bg-background px-3 py-2 font-body text-xs text-muted">
        <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
        Shared as your own experience. It is owner-reported and not independently verified.
      </p>
    </article>
  )
}

export function RepairOutcomeCard({ prompt }: { prompt: RepairOutcomePrompt }) {
  const { sendMessage, isResponding } = useChat()
  const { issueId } = prompt
  const [phase, setPhase] = useState<Phase>('loading')
  const [resolution, setResolution] = useState<RepairResolution | null>(null)
  const [post, setPost] = useState<PostDraft | null>(null)
  const [form, setForm] = useState<RepairOutcomeForm>(() => toOutcomeForm(prompt.status, prompt.resolution))
  const [errors, setErrors] = useState<RepairOutcomeErrors>({})
  const [nameMechanic, setNameMechanic] = useState(form.nameMechanic)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sawReply = useRef(false)
  const idPrefix = `repair-outcome-${issueId}`

  useEffect(() => {
    let current = true
    Promise.all([getRepairOutcome(issueId), findRepairPost(issueId).catch(() => null)])
      .then(([outcome, existing]) => {
        if (!current) return
        setPost(existing)
        if (existing?.status === 'published') return setPhase('published')
        if (existing) return setPhase('draft')
        if (outcome.status === 'resolved' && outcome.resolution) {
          setResolution(outcome.resolution)
          setNameMechanic(Boolean(outcome.resolution.mechanic_name))
          return setPhase('ready')
        }
        if (outcome.resolution && !prompt.resolution) setForm(toOutcomeForm(prompt.status, outcome.resolution))
        setPhase('form')
      })
      .catch((reason: unknown) => {
        if (!current) return
        if (reason instanceof ApiError && reason.status === 404) return setPhase('missing')
        setError('Your repair couldn’t be loaded. You can still fill in the outcome.')
        setPhase('form')
      })
    return () => {
      current = false
    }
  }, [issueId, prompt.resolution, prompt.status])

  // After the request is answered, check whether a draft now exists. A new draft also opens its own review card.
  useEffect(() => {
    if (phase !== 'requesting') return
    if (isResponding) {
      sawReply.current = true
      return
    }
    if (!sawReply.current) return
    sawReply.current = false
    let current = true
    findRepairPost(issueId)
      .then((existing) => {
        if (!current) return
        setPost(existing)
        if (existing?.status === 'published') return setPhase('published')
        if (existing) return setPhase('draft')
        setPhase(resolution ? 'ready' : 'form')
        setNotice('The story wasn’t drafted yet. Check the assistant’s reply above, then try again.')
      })
      .catch(() => {
        if (!current) return
        setPhase(resolution ? 'ready' : 'form')
        setError('Couldn’t check for your draft. Please try again.')
      })
    return () => {
      current = false
    }
  }, [phase, isResponding, issueId, resolution])

  function request(text: string, note: string) {
    if (isResponding) return
    setError(null)
    setNotice(null)
    sawReply.current = false
    setPhase('requesting')
    sendMessage(text, [], note)
  }

  async function saveOutcome() {
    const result = fromOutcomeForm(form)
    setErrors(result.errors)
    if (!result.isValid) {
      setError('Fix the highlighted fields first.')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const saved = await saveRepairOutcome(issueId, form.status, result.resolution)
      const stored = saved.resolution ?? result.resolution
      setResolution(stored)
      if (saved.status !== 'resolved') {
        setPhase('saved-unresolved')
        return
      }
      const allowName = form.method === 'mechanic' && Boolean(stored.mechanic_name) && nameMechanic
      request('I’d like to share my repair as a community story.', draftRequestNote(issueId, stored, allowName))
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'The outcome couldn’t be saved. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  function startEditing() {
    setForm(toOutcomeForm('resolved', resolution ?? undefined))
    setErrors({})
    setError(null)
    setNotice(null)
    setPhase('form')
  }

  if (phase === 'missing') return null

  if (phase === 'loading') {
    return <p className="mt-3 font-body text-xs text-muted">Checking your repair…</p>
  }

  if (phase === 'published' && post) {
    return (
      <section className="mt-3 flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary-light/60 px-4 py-3">
        <p className="flex min-w-0 items-center gap-2 font-body text-sm">
          <CheckCircle size={20} weight="fill" className="shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-semibold">Your repair story is already shared.</span>{' '}
            <span className="text-muted">“{post.title}”</span>
          </span>
        </p>
        <Link
          to={getStoryPath(post.id)}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-body text-sm font-semibold text-primary transition-colors duration-200 outline-none hover:bg-primary-light focus-visible:ring-2 focus-visible:ring-primary"
        >
          View story
          <ArrowRight size={14} weight="bold" aria-hidden="true" />
        </Link>
      </section>
    )
  }

  if (phase === 'dismissed') {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-xs text-muted">
        <EyeSlash size={16} aria-hidden="true" />
        Not shared. Your repair stays private.
        <button
          type="button"
          onClick={() => setPhase(resolution ? 'ready' : 'form')}
          className="rounded-full px-2 py-1 font-semibold text-secondary transition-colors duration-200 outline-none hover:bg-secondary-light focus-visible:ring-2 focus-visible:ring-secondary"
        >
          Share it after all
        </button>
      </p>
    )
  }

  if (phase === 'saved-unresolved') {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-xs text-muted">
        <CheckCircle size={16} className="text-secondary" aria-hidden="true" />
        Outcome saved. You can share a community story once it’s fixed.
        <button
          type="button"
          onClick={() => setPhase('form')}
          className="rounded-full px-2 py-1 font-semibold text-secondary transition-colors duration-200 outline-none hover:bg-secondary-light focus-visible:ring-2 focus-visible:ring-secondary"
        >
          Update outcome
        </button>
      </p>
    )
  }

  const isRequesting = phase === 'requesting'
  const isForm = phase === 'form'
  const isDraft = phase === 'draft'
  const showNameChoice = resolution?.method === 'mechanic' && Boolean(resolution.mechanic_name)

  function input(key: 'workPerformed' | 'instructions' | 'partsUsed' | 'cost' | 'mechanicName' | 'location' | 'insuranceSettlement', label: string, options: { optional?: boolean; hint?: string; multiline?: boolean; inputMode?: 'decimal'; placeholder?: string } = {}) {
    const fieldId = `${idPrefix}-${key}`
    const error = errors[key]
    const shared = {
      id: fieldId,
      value: form[key],
      disabled: isSaving,
      placeholder: options.placeholder,
      maxLength: key in outcomeLimits ? outcomeLimits[key as keyof typeof outcomeLimits] : undefined,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? `${fieldId}-error` : options.hint ? `${fieldId}-hint` : undefined,
    }
    return (
      <div className={options.multiline ? 'sm:col-span-2' : undefined}>
        <Field id={fieldId} label={label} optional={options.optional} hint={options.hint} error={error}>
          {options.multiline ? (
            <textarea
              {...shared}
              rows={3}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              className={`${fieldClassName} resize-y px-3.5 py-2.5 leading-relaxed`}
            />
          ) : (
            <input
              {...shared}
              inputMode={options.inputMode}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              className={`${fieldClassName} h-11 px-3.5`}
            />
          )}
        </Field>
      </div>
    )
  }

  return (
    <motion.section
      aria-labelledby={`${idPrefix}-heading`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={cardTransition}
      className="mt-3 max-w-xl rounded-3xl border border-secondary/15 bg-secondary-light/60 p-3 sm:p-4"
    >
      <header className="px-1">
        <h3 id={`${idPrefix}-heading`} className="flex items-center gap-1.5 font-body text-sm font-semibold text-secondary">
          <Wrench size={16} weight="duotone" aria-hidden="true" />
          {isDraft ? 'Your repair story draft is waiting' : isForm ? 'How did the repair turn out?' : 'Share this repair as a community story?'}
        </h3>
        <p className="mt-0.5 flex items-center gap-1 font-body text-xs text-muted">
          <ShieldCheck size={14} aria-hidden="true" />
          {isForm
            ? 'Saved privately to your repair. Nothing is posted.'
            : 'We draft it first. It goes to Community stories only when you confirm.'}
        </p>
      </header>

      <div className="mt-3">
        {isForm && (
          <div className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2">
            <ChoiceGroup
              name={`${idPrefix}-status`}
              legend="Is it fixed?"
              value={form.status}
              options={statusOptions}
              disabled={isSaving}
              onChange={(status) => setForm((current) => ({ ...current, status }))}
            />
            <ChoiceGroup
              name={`${idPrefix}-method`}
              legend="Who worked on it?"
              value={form.method}
              options={methodOptions}
              disabled={isSaving}
              onChange={(method) => setForm((current) => ({ ...current, method }))}
            />
            {form.method === 'mechanic' ? (
              <>
                {input('workPerformed', 'Work done', { multiline: true, placeholder: 'e.g. Replaced the front brake pads and rotors' })}
                {input('mechanicName', 'Mechanic or shop name', { optional: true })}
                {input('location', 'Where', { optional: true, placeholder: 'e.g. Austin, TX' })}
              </>
            ) : (
              <>
                {input('instructions', 'What you did', { multiline: true, placeholder: 'e.g. Replaced the worn brake pads' })}
                {input('partsUsed', 'Parts used', { optional: true, hint: 'Separate with commas.' })}
              </>
            )}
            {input('cost', 'Cost', { optional: true, inputMode: 'decimal', placeholder: 'e.g. 250' })}
            {input('insuranceSettlement', 'Insurance note', { optional: true, multiline: true })}
            {form.method === 'mechanic' && form.mechanicName.trim() && form.status === 'resolved' && (
              <label className="flex items-center gap-2 font-body text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={nameMechanic}
                  onChange={(event) => setNameMechanic(event.target.checked)}
                  disabled={isSaving}
                  className="size-4 accent-[var(--color-primary)]"
                />
                Mention who fixed it in my story
              </label>
            )}
          </div>
        )}

        {(phase === 'ready' || isRequesting) && resolution && (
          <OutcomeSummary resolution={resolution}>
            {showNameChoice && (
              <label className="mt-4 flex items-center gap-2 border-t border-border pt-4 font-body text-sm">
                <input
                  type="checkbox"
                  checked={nameMechanic}
                  onChange={(event) => setNameMechanic(event.target.checked)}
                  disabled={isRequesting}
                  className="size-4 accent-[var(--color-primary)]"
                />
                Mention {resolution.mechanic_name}
                {resolution.location ? ` in ${resolution.location}` : ''} in my story
              </label>
            )}
          </OutcomeSummary>
        )}

        {isRequesting && !resolution && (
          <p className="px-1 font-body text-sm text-muted">Asking the assistant to show your draft…</p>
        )}

        {isDraft && post && (
          <article className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <p className="font-body text-xs font-medium tracking-wide text-muted uppercase">Private draft</p>
            <p className="mt-1 font-heading text-base leading-snug font-bold break-words">{post.title}</p>
            <p className="mt-2 line-clamp-3 font-body text-sm leading-relaxed whitespace-pre-wrap text-muted">{post.content}</p>
          </article>
        )}
      </div>

      {(error || notice) && (
        <p role={error ? 'alert' : 'status'} className={`mt-3 px-1 font-body text-xs font-medium ${error ? 'text-danger' : 'text-secondary'}`}>
          {error ?? notice}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isForm && (
          <Button onClick={() => void saveOutcome()} disabled={isSaving || isResponding}>
            {form.status === 'resolved' ? <Sparkle size={16} weight="bold" aria-hidden="true" /> : null}
            {isSaving ? 'Saving…' : form.status === 'resolved' ? 'Save and draft my story' : 'Save outcome'}
          </Button>
        )}
        {(phase === 'ready' || isRequesting) && resolution && (
          <>
            <Button
              onClick={() =>
                request(
                  'I’d like to share my repair as a community story.',
                  draftRequestNote(issueId, resolution, showNameChoice && nameMechanic),
                )
              }
              disabled={isRequesting || isResponding}
            >
              <Sparkle size={16} weight="bold" aria-hidden="true" />
              {isRequesting ? 'Drafting…' : 'Draft my community story'}
            </Button>
            <Button variant="secondary" onClick={startEditing} disabled={isRequesting}>
              <PencilSimple size={16} aria-hidden="true" />
              Edit outcome
            </Button>
          </>
        )}
        {isDraft && post && (
          <Button onClick={() => request('Show me my repair story draft.', showDraftNote(issueId, post))} disabled={isResponding}>
            Review my draft
          </Button>
        )}
        <button
          type="button"
          onClick={() => setPhase('dismissed')}
          disabled={isRequesting || isSaving}
          className="ml-auto rounded-full px-3 py-2 font-body text-sm font-medium text-muted transition-colors duration-200 outline-none hover:bg-secondary-light hover:text-text focus-visible:ring-2 focus-visible:ring-secondary disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </motion.section>
  )
}
