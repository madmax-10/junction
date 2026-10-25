import {
  BadgeCheck,
  Car,
  Check,
  CircleDashed,
  Images,
  MessagesSquare,
  PencilLine,
  Plus,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { Button } from '../../components/ui/Button.tsx'
import { useScrollFade } from '../../hooks/useScrollFade.ts'
import { fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import type { SectionStatus, SituationSection } from '../../types/intake.ts'
import { useChat } from '../chat/ChatContext.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import { formatMileage } from '../intake/intakeHighlights.ts'
import { accidentTypeOptions, getOptionLabel, interestOptions, situationOptions } from '../intake/intakeOptions.tsx'
import { getSectionStatus } from '../intake/situationFields.ts'

type SituationIslandProps = {
  className?: string
  onEdit: (section: SituationSection | null) => void
}

const maxVisiblePhotos = 8
const iconStroke = 1.75

function StatusTag({ status }: { status: SectionStatus }) {
  if (status === 'confirmed') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 font-body text-[0.7rem] font-semibold text-primary">
        <BadgeCheck size={14} strokeWidth={2} aria-hidden="true" />
        Confirmed
      </span>
    )
  }
  if (status === 'unconfirmed') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-text/25 px-2 py-0.5 font-body text-[0.7rem] font-semibold text-muted">
        <CircleDashed size={12} strokeWidth={2} aria-hidden="true" />
        Unconfirmed
      </span>
    )
  }
  return <span className="shrink-0 font-body text-[0.7rem] font-medium text-text/45">Not added</span>
}

function IslandSection({
  section,
  title,
  icon: Icon,
  status,
  addLabel,
  onEdit,
  onConfirm,
  children,
}: {
  section: SituationSection
  title: string
  icon: LucideIcon
  status: SectionStatus
  addLabel: string
  onEdit: (section: SituationSection) => void
  onConfirm: (section: SituationSection) => void
  children: ReactNode
}) {
  const titleId = `situation-${section}-title`

  return (
    <motion.section
      variants={fadeUpVariants}
      aria-labelledby={titleId}
      className={`rounded-2xl p-3.5 ${
        status === 'unconfirmed' ? 'border border-dashed border-text/20 bg-surface' : 'bg-background/70'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={titleId} className="flex min-w-0 items-center gap-2 font-body text-sm font-semibold">
          <Icon size={16} strokeWidth={iconStroke} className="shrink-0 text-primary" aria-hidden="true" />
          {title}
        </h3>
        <StatusTag status={status} />
      </div>

      {status === 'missing' ? (
        <button
          type="button"
          onClick={() => onEdit(section)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full font-body text-sm font-medium text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          {addLabel}
        </button>
      ) : (
        <>
          <div className="mt-2.5">{children}</div>
          {status === 'unconfirmed' && (
            <div className="mt-3 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onConfirm(section)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 font-body text-xs font-semibold text-surface transition-colors duration-200 outline-none hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <Check size={14} strokeWidth={2.25} aria-hidden="true" />
                Looks right
              </button>
              <button
                type="button"
                onClick={() => onEdit(section)}
                className="inline-flex h-8 items-center rounded-full px-3 font-body text-xs font-semibold text-secondary transition-colors duration-200 outline-none hover:bg-secondary-light focus-visible:ring-2 focus-visible:ring-secondary"
              >
                Edit
              </button>
            </div>
          )}
        </>
      )}
    </motion.section>
  )
}

function VehicleDetail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="font-body text-[0.7rem] text-text/55">{label}</dt>
      <dd
        title={value ?? undefined}
        className={`truncate font-body text-sm ${value ? 'font-medium' : 'text-text/40'}`}
      >
        {value ?? 'Not added'}
      </dd>
    </div>
  )
}

export function SituationIsland({ className = '', onEdit }: SituationIslandProps) {
  const { draft, confirmed, confirmSections } = useIntakeDraft()
  const { messages } = useChat()
  const setFadeElement = useScrollFade<HTMLDivElement>()
  const { vehicle } = draft

  const mileage = formatMileage(vehicle.mileage)
  const model = [vehicle.model, vehicle.trim.trim()].filter(Boolean).join(' ') || null
  const accidentLabel = getOptionLabel(accidentTypeOptions, draft.accidentType)
  const insuranceLabel = getOptionLabel(situationOptions, draft.situation)
  const details = draft.details.trim()
  const question = draft.question.trim()
  const interests = draft.interests
    .map((interest) => getOptionLabel(interestOptions, interest))
    .filter((label): label is string => Boolean(label))
  const photos = messages.flatMap((message) => (message.role === 'user' ? message.images : []))
  const visiblePhotos = photos.slice(0, maxVisiblePhotos)
  const hiddenPhotoCount = photos.length - visiblePhotos.length

  const statuses: Record<SituationSection, SectionStatus> = {
    vehicle: getSectionStatus(draft, confirmed, 'vehicle'),
    accident: getSectionStatus(draft, confirmed, 'accident'),
    insurance: getSectionStatus(draft, confirmed, 'insurance'),
    concerns: getSectionStatus(draft, confirmed, 'concerns'),
  }
  const statusList = Object.values(statuses)
  const confirmedCount = statusList.filter((status) => status === 'confirmed').length
  const unconfirmedCount = statusList.filter((status) => status === 'unconfirmed').length
  const summary = [
    `${confirmedCount} of ${statusList.length} confirmed`,
    unconfirmedCount > 0 ? `${unconfirmedCount} to review` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  function confirmSection(section: SituationSection) {
    confirmSections([section])
  }

  return (
    <motion.section
      aria-labelledby="situation-title"
      initial="hidden"
      animate="visible"
      variants={staggerVariants(0.05, 0.1)}
      className={`flex min-h-0 flex-col rounded-[1.75rem] border border-border bg-surface shadow-card ${className}`}
    >
      <header className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="situation-title" className="font-heading text-lg font-bold tracking-tight">
            My Situation
          </h2>
          <Button variant="secondary" onClick={() => onEdit(null)} className="shrink-0">
            <PencilLine size={15} strokeWidth={iconStroke} aria-hidden="true" />
            Edit details
          </Button>
        </div>
        <p className="mt-1.5 font-body text-xs text-muted">{summary}</p>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {statusList.map((status, index) => (
            <span
              key={index}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                status === 'confirmed' ? 'bg-primary' : status === 'unconfirmed' ? 'bg-accent' : 'bg-text/10'
              }`}
            />
          ))}
        </div>
      </header>

      <div ref={setFadeElement} className="scroll-fade-y flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 pb-5">
        <IslandSection
          section="vehicle"
          title="Vehicle"
          icon={Car}
          status={statuses.vehicle}
          addLabel="Add your vehicle"
          onEdit={onEdit}
          onConfirm={confirmSection}
        >
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <VehicleDetail label="Make" value={vehicle.make} />
            <VehicleDetail label="Model" value={model} />
            <VehicleDetail label="Year" value={vehicle.year} />
            <VehicleDetail label="Mileage" value={mileage ? `${mileage} mi` : null} />
          </dl>
        </IslandSection>

        <IslandSection
          section="accident"
          title="What happened"
          icon={TriangleAlert}
          status={statuses.accident}
          addLabel="Add what happened"
          onEdit={onEdit}
          onConfirm={confirmSection}
        >
          <p className={`font-body text-sm ${accidentLabel ? 'font-medium' : 'text-text/40'}`}>
            {accidentLabel ?? 'Not added yet'}
          </p>
          {details && (
            <p className="mt-1 line-clamp-3 font-body text-sm leading-snug text-muted">{details}</p>
          )}
        </IslandSection>

        <IslandSection
          section="insurance"
          title="Insurance status"
          icon={ShieldCheck}
          status={statuses.insurance}
          addLabel="Add insurance status"
          onEdit={onEdit}
          onConfirm={confirmSection}
        >
          <p className={`font-body text-sm ${insuranceLabel ? 'font-medium' : 'text-text/40'}`}>
            {insuranceLabel ?? 'Not added yet'}
          </p>
          {draft.insuranceSettlement && (
            <p className="mt-1 line-clamp-3 font-body text-sm leading-snug text-text/70">{draft.insuranceSettlement}</p>
          )}
        </IslandSection>

        <IslandSection
          section="concerns"
          title="Main concerns"
          icon={MessagesSquare}
          status={statuses.concerns}
          addLabel="Add what matters to you"
          onEdit={onEdit}
          onConfirm={confirmSection}
        >
          {interests.length > 0 && (
            <ul className="space-y-1">
              {interests.map((interest) => (
                <li key={interest} className="flex items-start gap-2 font-body text-sm leading-snug">
                  <Check size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  {interest}
                </li>
              ))}
            </ul>
          )}
          {(draft.minBudget || draft.maxBudget) && (
            <ul className={`space-y-1 ${interests.length > 0 ? 'mt-2.5' : ''}`}>
              {draft.minBudget && (
                <li className="flex items-start gap-2 font-body text-sm leading-snug">
                  <Check size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  Minimum budget ${draft.minBudget}
                </li>
              )}
              {draft.maxBudget && (
                <li className="flex items-start gap-2 font-body text-sm leading-snug">
                  <Check size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  Maximum budget ${draft.maxBudget}
                </li>
              )}
            </ul>
          )}
          {question && (
            <blockquote
              className={`line-clamp-3 border-l-2 border-primary/30 pl-2.5 font-body text-sm leading-snug text-text/75 ${
                interests.length > 0 ? 'mt-2.5' : ''
              }`}
            >
              {question}
            </blockquote>
          )}
        </IslandSection>

        <motion.section
          variants={fadeUpVariants}
          aria-labelledby="situation-photos-title"
          className="rounded-2xl bg-background/70 p-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 id="situation-photos-title" className="flex items-center gap-2 font-body text-sm font-semibold">
              <Images size={16} strokeWidth={iconStroke} className="shrink-0 text-primary" aria-hidden="true" />
              Photos
            </h3>
            <span className="font-body text-[0.7rem] font-medium text-text/55 tabular-nums">
              {photos.length > 0 ? `${photos.length} shared` : 'None yet'}
            </span>
          </div>

          {photos.length > 0 ? (
            <ul className="mt-2.5 grid grid-cols-4 gap-1.5">
              {visiblePhotos.map((photo, index) => {
                const isLastVisible = index === visiblePhotos.length - 1 && hiddenPhotoCount > 0
                return (
                  <li key={photo.id} className="relative">
                    <a
                      href={photo.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open photo: ${photo.name}`}
                      className="block overflow-hidden rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                    >
                      <img
                        src={photo.url}
                        alt=""
                        className="aspect-square w-full border border-border object-cover transition-transform duration-200 ease-out hover:scale-105"
                      />
                      {isLastVisible && (
                        <span className="absolute inset-0 grid place-items-center rounded-xl bg-text/55 font-body text-xs font-semibold text-surface">
                          +{hiddenPhotoCount}
                        </span>
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-2 font-body text-sm leading-snug text-muted">
              Damage photos you share in the{' '}
              <Link
                to={paths.chat}
                className="rounded font-medium text-secondary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-secondary"
              >
                Assistant
              </Link>{' '}
              will appear here.
            </p>
          )}
        </motion.section>
      </div>
    </motion.section>
  )
}
