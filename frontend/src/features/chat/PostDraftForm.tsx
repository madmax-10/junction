import { CheckCircle } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Field } from '../../components/ui/Field.tsx'
import { fieldClassName } from '../../components/ui/fieldStyles.ts'
import type { PostIssueType } from '../../types/post.ts'
import { fieldLimits, maxPhotos, type PostForm, type PostFormErrors } from './postDraftForm.ts'
import type { LoadedIssuePhoto } from './useIssuePhotos.ts'

type PostDraftFormProps = {
  idPrefix: string
  issueType: PostIssueType
  form: PostForm
  errors: PostFormErrors
  photos: { status: 'loading' | 'ready' | 'error'; photos: LoadedIssuePhoto[] }
  disabled: boolean
  onChange: (changes: Partial<PostForm>) => void
}

type TextFieldKey = { [K in keyof PostForm]: PostForm[K] extends string ? K : never }[keyof PostForm]

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <legend className="float-left w-full font-body text-xs font-semibold tracking-wide text-secondary uppercase">
        {title}
      </legend>
      {hint && <p className="clear-left pt-1 font-body text-xs text-muted">{hint}</p>}
      <div className="clear-left grid gap-4 pt-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

export function PostDraftForm({ idPrefix, issueType, form, errors, photos, disabled, onChange }: PostDraftFormProps) {
  const id = (key: string) => `${idPrefix}-${key}`

  function input(
    key: TextFieldKey,
    label: string,
    options: { optional?: boolean; hint?: string; inputMode?: 'numeric' | 'decimal' | 'email' | 'tel' | 'url'; placeholder?: string; wide?: boolean } = {},
  ) {
    const error = errors[key]
    return (
      <div className={options.wide ? 'sm:col-span-2' : undefined}>
        <Field id={id(key)} label={label} optional={options.optional} hint={options.hint} error={error}>
          <input
            id={id(key)}
            value={form[key]}
            onChange={(event) => onChange({ [key]: event.target.value })}
            inputMode={options.inputMode}
            type={options.inputMode === 'email' ? 'email' : options.inputMode === 'url' ? 'url' : options.inputMode === 'tel' ? 'tel' : 'text'}
            placeholder={options.placeholder}
            maxLength={fieldLimits[key]}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id(key)}-error` : options.hint ? `${id(key)}-hint` : undefined}
            className={`${fieldClassName} h-11 px-3.5`}
          />
        </Field>
      </div>
    )
  }

  function textArea(key: TextFieldKey, label: string, options: { optional?: boolean; hint?: string; rows?: number } = {}) {
    const error = errors[key]
    return (
      <div className="sm:col-span-2">
        <Field id={id(key)} label={label} optional={options.optional} hint={options.hint} error={error}>
          <textarea
            id={id(key)}
            value={form[key]}
            onChange={(event) => onChange({ [key]: event.target.value })}
            rows={options.rows ?? 3}
            maxLength={fieldLimits[key]}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id(key)}-error` : options.hint ? `${id(key)}-hint` : undefined}
            className={`${fieldClassName} resize-y px-3.5 py-2.5 leading-relaxed`}
          />
        </Field>
      </div>
    )
  }

  function togglePhoto(path: string) {
    const selected = form.photos.includes(path)
    onChange({ photos: selected ? form.photos.filter((item) => item !== path) : [...form.photos, path] })
  }

  return (
    <div className="space-y-5">
      <Section title="Post">
        {input('title', 'Title', { wide: true })}
        {textArea('content', 'Post text', { rows: 6, hint: 'Written in your voice. This is exactly what people will read.' })}
      </Section>

      {(issueType === 'sell' || issueType === 'repair') && (
        <Section title="Vehicle">
          {input('make', 'Make', { optional: true })}
          {input('model', 'Model', { optional: true })}
          {input('year', 'Year', { optional: true, inputMode: 'numeric' })}
          {input('trim', 'Trim', { optional: true })}
          {input('mileage', 'Mileage', { optional: true, inputMode: 'numeric', placeholder: 'e.g. 62000' })}
        </Section>
      )}

      {issueType === 'sell' && (
        <>
          <Section title="Price and location">
            {input('askingPrice', 'Asking price', { optional: true, inputMode: 'decimal', placeholder: 'e.g. 14500' })}
            {input('location', 'Location', { optional: true, placeholder: 'e.g. Austin, TX' })}
          </Section>
          <Section title="Condition">
            {input('mechanical', 'Mechanical', { optional: true })}
            {input('exterior', 'Exterior', { optional: true })}
            {input('interior', 'Interior', { optional: true })}
            {input('maintenanceHistory', 'Maintenance history', { optional: true })}
            {textArea('knownDamage', 'Known damage', { optional: true, rows: 2 })}
          </Section>
        </>
      )}

      {issueType === 'buy' && (
        <Section title="What you’re looking for">
          {input('minBudget', 'Minimum budget', { optional: true, inputMode: 'decimal' })}
          {input('maxBudget', 'Maximum budget', { optional: true, inputMode: 'decimal' })}
          {input('preferredMakes', 'Preferred makes', { optional: true, hint: 'Separate with commas.' })}
          {input('preferredModels', 'Preferred models', { optional: true, hint: 'Separate with commas.' })}
          {input('minimumYear', 'Oldest year', { optional: true, inputMode: 'numeric' })}
          {input('maximumMileage', 'Maximum mileage', { optional: true, inputMode: 'numeric' })}
          <Field id={id('vehicleType')} label="New or used" optional>
            <select
              id={id('vehicleType')}
              value={form.vehicleType}
              onChange={(event) => onChange({ vehicleType: event.target.value as PostForm['vehicleType'] })}
              disabled={disabled}
              className={`${fieldClassName} h-11 px-3.5`}
            >
              <option value="">Either</option>
              <option value="new">New</option>
              <option value="used">Used</option>
            </select>
          </Field>
          {input('fuelType', 'Fuel type', { optional: true, placeholder: 'e.g. hybrid' })}
          {input('location', 'Location', { optional: true, wide: true, placeholder: 'e.g. Austin, TX' })}
        </Section>
      )}

      {issueType === 'repair' && (
        <>
          <Section title="Symptoms">
            {textArea('confirmedSymptoms', 'What you noticed', { optional: true, hint: 'One per line.', rows: 3 })}
            {textArea('inferredSymptoms', 'Possibly related', { optional: true, hint: 'One per line. Things you suspect but did not confirm.', rows: 2 })}
          </Section>
          <Section title="The fix">
            <Field id={id('method')} label="Who fixed it" optional>
              <select
                id={id('method')}
                value={form.method}
                onChange={(event) => onChange({ method: event.target.value as PostForm['method'] })}
                disabled={disabled}
                className={`${fieldClassName} h-11 px-3.5`}
              >
                <option value="">Not specified</option>
                <option value="mechanic">A mechanic or shop</option>
                <option value="self">I fixed it myself</option>
              </select>
            </Field>
            {input('cost', 'Cost', { optional: true, inputMode: 'decimal', placeholder: 'e.g. 250' })}
            {form.method !== 'self' &&
              input('mechanicName', 'Mechanic or shop name', {
                optional: true,
                wide: true,
                hint: 'Leave empty if you’d rather not name them.',
              })}
            {textArea('workPerformed', 'Work done', { optional: true, rows: 3 })}
            {textArea('insuranceSettlement', 'Insurance note', { optional: true, rows: 2 })}
          </Section>
        </>
      )}

      {issueType !== 'repair' && (
        <Section title="Public contact" hint="Only what you enter here is shown. Leave it empty and people can message you in the app.">
          {input('phone', 'Phone', { optional: true, inputMode: 'tel' })}
          {input('email', 'Email', { optional: true, inputMode: 'email' })}
          {input('link', 'Link', { optional: true, inputMode: 'url', wide: true, placeholder: 'https://' })}
        </Section>
      )}

      <fieldset className="min-w-0 border-t border-border pt-4">
        <legend className="float-left w-full font-body text-xs font-semibold tracking-wide text-secondary uppercase">
          Photos
        </legend>
        <p className="clear-left pt-1 font-body text-xs text-muted">
          Choose up to {maxPhotos} of the photos you added to this {issueType === 'repair' ? 'repair' : issueType === 'sell' ? 'sale' : 'request'}.
        </p>
        {photos.status === 'loading' && <p className="pt-3 font-body text-sm text-muted">Loading your photos…</p>}
        {photos.status === 'error' && <p className="pt-3 font-body text-sm text-muted">Your photos couldn’t be loaded.</p>}
        {photos.status === 'ready' && photos.photos.length === 0 && (
          <p className="pt-3 font-body text-sm text-muted">No photos yet. Add some from the chat composer.</p>
        )}
        {photos.photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 pt-3 sm:grid-cols-4">
            {photos.photos.map((photo, index) => {
              const selected = form.photos.includes(photo.path)
              return (
                <li key={photo.path}>
                  <button
                    type="button"
                    onClick={() => togglePhoto(photo.path)}
                    disabled={disabled}
                    aria-pressed={selected}
                    aria-label={`Photo ${index + 1}${selected ? ', included' : ''}`}
                    className={`relative block aspect-square w-full overflow-hidden rounded-xl border-2 transition-[border-color,opacity] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${selected ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  >
                    <img src={photo.url} alt="" className="size-full object-cover" />
                    {selected && (
                      <CheckCircle
                        size={22}
                        weight="fill"
                        className="absolute top-1.5 right-1.5 rounded-full bg-surface text-primary"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {errors.photos && <p className="pt-2 font-body text-xs font-medium text-danger">{errors.photos}</p>}
      </fieldset>
    </div>
  )
}
