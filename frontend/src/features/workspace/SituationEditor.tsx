import { Car, MessagesSquare, ShieldCheck, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button.tsx'
import { ChoiceCard } from '../../components/ui/ChoiceCard.tsx'
import { Combobox } from '../../components/ui/Combobox.tsx'
import { Field } from '../../components/ui/Field.tsx'
import { TextArea } from '../../components/ui/TextArea.tsx'
import { TextInput } from '../../components/ui/TextInput.tsx'
import { vehicleCatalog, vehicleMakes, vehicleYears } from '../../mocks/vehicleCatalog.ts'
import { easeOutQuint } from '../../styles/motion.ts'
import type { AccidentType, CurrentSituation, IntakeDraft, LearningInterest, SituationSection } from '../../types/intake.ts'
import { situationSections, useIntakeDraft } from '../intake/IntakeContext.ts'
import { formatMileage } from '../intake/intakeHighlights.ts'
import { detailsMaxLength, questionMaxLength, sanitizeMileage, trimMaxLength } from '../intake/intakeLimits.ts'
import {
  accidentTypeOptions,
  interestOptions,
  situationOptions,
  toggleInterest,
} from '../intake/intakeOptions.tsx'

type SituationEditorProps = {
  isOpen: boolean
  focusSection: SituationSection | null
  onClose: () => void
}

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])'
const sheetTransition = { duration: 0.3, ease: easeOutQuint }

function EditorSection({
  section,
  title,
  icon: Icon,
  children,
}: {
  section: SituationSection
  title: string
  icon: LucideIcon
  children: ReactNode
}) {
  const titleId = `edit-${section}-title`
  return (
    <section
      id={`edit-section-${section}`}
      aria-labelledby={titleId}
      className="scroll-mt-4 border-t border-text/[0.06] py-6 first:border-t-0 first:pt-2"
    >
      <h3 id={titleId} className="flex items-center gap-2 font-heading text-base font-bold tracking-tight">
        <span className="grid size-8 place-items-center rounded-xl bg-primary-light text-primary" aria-hidden="true">
          <Icon size={16} strokeWidth={1.75} />
        </span>
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function EditorSheet({ focusSection, onClose }: Omit<SituationEditorProps, 'isOpen'>) {
  const { draft, updateDraft, updateVehicle, confirmSections } = useIntakeDraft()
  const [initialSection] = useState(focusSection)
  const [vehicle, setVehicle] = useState(draft.vehicle)
  const [fields, setFields] = useState<Omit<IntakeDraft, 'vehicle'>>({
    accidentType: draft.accidentType,
    situation: draft.situation,
    details: draft.details,
    interests: draft.interests,
    question: draft.question,
  })
  const panelRef = useRef<HTMLDivElement>(null)
  const models = vehicle.make ? (vehicleCatalog[vehicle.make] ?? []) : []

  useEffect(() => {
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    const sectionElement = initialSection ? panel?.querySelector(`#edit-section-${initialSection}`) : null
    sectionElement?.scrollIntoView({ block: 'start' })
    const firstField = (sectionElement ?? panel)?.querySelector<HTMLElement>('input, textarea')
    firstField?.focus({ preventScroll: true })
    return () => returnFocusTo?.focus()
  }, [initialSection])

  function updateFields(changes: Partial<typeof fields>) {
    setFields((current) => ({ ...current, ...changes }))
  }

  function handleMakeChange(make: string | null) {
    setVehicle((current) => (make === current.make ? current : { ...current, make, model: null }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateVehicle({ ...vehicle, trim: vehicle.trim.trim() })
    updateDraft(fields)
    confirmSections(situationSections)
    onClose()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return

    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (element) => element.tabIndex >= 0,
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={onClose}
        className="absolute inset-0 bg-text/25 backdrop-blur-[2px]"
        aria-hidden="true"
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-situation-title"
        aria-describedby="edit-situation-description"
        onKeyDown={handleKeyDown}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        transition={sheetTransition}
        className="relative m-3 flex w-full max-w-[34rem] flex-col overflow-hidden rounded-[1.75rem] border border-text/[0.06] bg-surface shadow-card-hover"
      >
        <header className="flex items-start justify-between gap-4 border-b border-text/[0.06] px-6 pt-5 pb-4">
          <div>
            <h2 id="edit-situation-title" className="font-heading text-xl font-extrabold tracking-[-0.02em]">
              Edit details
            </h2>
            <p id="edit-situation-description" className="mt-1 font-body text-sm text-text/65">
              Keep your situation up to date so the stories you see stay relevant.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close without saving"
            className="grid size-10 shrink-0 place-items-center rounded-full text-text/60 transition-colors duration-200 outline-none hover:bg-background hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
            <EditorSection section="vehicle" title="Vehicle" icon={Car}>
              <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                <Field id="edit-vehicle-make" label="Make">
                  <Combobox
                    id="edit-vehicle-make"
                    options={vehicleMakes}
                    value={vehicle.make}
                    onChange={handleMakeChange}
                    placeholder="Search manufacturers"
                    allowCustomValue
                    emptyMessage="Keep typing to add your manufacturer"
                  />
                </Field>
                <Field id="edit-vehicle-model" label="Model">
                  <Combobox
                    id="edit-vehicle-model"
                    options={models}
                    value={vehicle.model}
                    onChange={(model) => setVehicle((current) => ({ ...current, model }))}
                    disabled={!vehicle.make}
                    placeholder={vehicle.make ? `Search ${vehicle.make} models` : 'Choose a make first'}
                    allowCustomValue
                    emptyMessage="Type your model to add it"
                  />
                </Field>
                <Field id="edit-vehicle-year" label="Year">
                  <Combobox
                    id="edit-vehicle-year"
                    options={vehicleYears}
                    value={vehicle.year}
                    onChange={(year) => setVehicle((current) => ({ ...current, year }))}
                    placeholder="Select year"
                    inputMode="numeric"
                    emptyMessage={`Choose a year from ${vehicleYears[vehicleYears.length - 1]} to ${vehicleYears[0]}`}
                  />
                </Field>
                <Field id="edit-vehicle-mileage" label="Mileage">
                  <TextInput
                    id="edit-vehicle-mileage"
                    inputMode="numeric"
                    autoComplete="off"
                    suffix="miles"
                    placeholder="e.g. 48,000"
                    value={formatMileage(vehicle.mileage)}
                    onChange={(event) =>
                      setVehicle((current) => ({ ...current, mileage: sanitizeMileage(event.target.value) }))
                    }
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="edit-vehicle-trim" label="Trim" optional>
                    <TextInput
                      id="edit-vehicle-trim"
                      value={vehicle.trim}
                      maxLength={trimMaxLength}
                      autoComplete="off"
                      onChange={(event) => setVehicle((current) => ({ ...current, trim: event.target.value }))}
                      placeholder="e.g. EX, SE, Limited"
                    />
                  </Field>
                </div>
              </div>
            </EditorSection>

            <EditorSection section="accident" title="What happened" icon={TriangleAlert}>
              <div role="radiogroup" aria-label="What happened" className="grid grid-cols-2 gap-3">
                {accidentTypeOptions.map((option) => (
                  <ChoiceCard
                    key={option.value}
                    name="edit-accident-type"
                    orientation="tile"
                    value={option.value}
                    label={option.label}
                    description={option.description}
                    icon={option.icon}
                    checked={fields.accidentType === option.value}
                    onSelect={(value) => updateFields({ accidentType: value as AccidentType })}
                  />
                ))}
              </div>
              <div className="mt-5">
                <Field id="edit-details" label="What happened" optional>
                  <TextArea
                    id="edit-details"
                    rows={3}
                    maxLength={detailsMaxLength}
                    value={fields.details}
                    onChange={(event) => updateFields({ details: event.target.value })}
                    placeholder="Tell us a little more..."
                  />
                </Field>
              </div>
            </EditorSection>

            <EditorSection section="insurance" title="Insurance status" icon={ShieldCheck}>
              <div role="radiogroup" aria-label="Insurance status" className="flex flex-col gap-3">
                {situationOptions.map((option) => (
                  <ChoiceCard
                    key={option.value}
                    name="edit-situation"
                    value={option.value}
                    label={option.label}
                    description={option.description}
                    icon={option.icon}
                    checked={fields.situation === option.value}
                    onSelect={(value) => updateFields({ situation: value as CurrentSituation })}
                  />
                ))}
              </div>
            </EditorSection>

            <EditorSection section="concerns" title="Main concerns" icon={MessagesSquare}>
              <div role="group" aria-label="Whose experiences would help" className="flex flex-col gap-3">
                {interestOptions.map((option) => (
                  <ChoiceCard
                    key={option.value}
                    multiple
                    name="edit-interests"
                    value={option.value}
                    label={option.label}
                    description={option.description}
                    icon={option.icon}
                    checked={fields.interests.includes(option.value)}
                    onSelect={(value) =>
                      updateFields({ interests: toggleInterest(fields.interests, value as LearningInterest) })
                    }
                  />
                ))}
              </div>
              <div className="mt-5">
                <Field id="edit-question" label="Anything specific you’re wondering about?" optional>
                  <TextArea
                    id="edit-question"
                    rows={3}
                    maxLength={questionMaxLength}
                    value={fields.question}
                    onChange={(event) => updateFields({ question: event.target.value })}
                    placeholder="e.g. Was it worth repairing a car with frame damage?"
                  />
                </Field>
              </div>
            </EditorSection>
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-text/[0.06] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-body text-xs text-text/60">Saving marks these details as confirmed by you.</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-none">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 sm:flex-none">
                Save details
              </Button>
            </div>
          </footer>
        </form>
      </motion.div>
    </div>
  )
}

export function SituationEditor({ isOpen, focusSection, onClose }: SituationEditorProps) {
  return (
    <AnimatePresence>
      {isOpen && <EditorSheet key="situation-editor" focusSection={focusSection} onClose={onClose} />}
    </AnimatePresence>
  )
}
