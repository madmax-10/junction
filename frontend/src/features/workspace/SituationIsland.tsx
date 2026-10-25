import { Car, CheckCircle, Gauge, PencilSimple, ShieldCheck, Warning } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/paths.ts'
import { fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import { formatMileage, getVehicleName } from '../intake/intakeHighlights.ts'
import { accidentTypeOptions, getOptionLabel, interestOptions, situationOptions } from '../intake/intakeOptions.tsx'

type SituationFact = {
  id: string
  label: string
  value: string | null
  icon: ReactNode
}

const sectionLabelClassName = 'font-body text-xs font-semibold tracking-wide text-text/55 uppercase'

export function SituationIsland({ className = '' }: { className?: string }) {
  const { draft } = useIntakeDraft()
  const mileage = formatMileage(draft.vehicle.mileage)
  const details = draft.details.trim()
  const interests = draft.interests
    .map((interest) => getOptionLabel(interestOptions, interest))
    .filter((label): label is string => Boolean(label))

  const facts: SituationFact[] = [
    { id: 'vehicle', label: 'Vehicle', value: getVehicleName(draft.vehicle), icon: <Car size={18} /> },
    { id: 'mileage', label: 'Mileage', value: mileage ? `${mileage} miles` : null, icon: <Gauge size={18} /> },
    {
      id: 'accident',
      label: 'Accident type',
      value: getOptionLabel(accidentTypeOptions, draft.accidentType),
      icon: <Warning size={18} />,
    },
    {
      id: 'insurance',
      label: 'Insurance status',
      value: getOptionLabel(situationOptions, draft.situation),
      icon: <ShieldCheck size={18} />,
    },
  ]
  const hasDetails = facts.some((fact) => fact.value) || details.length > 0 || interests.length > 0

  return (
    <motion.section
      aria-labelledby="situation-title"
      initial="hidden"
      animate="visible"
      variants={staggerVariants(0.05, 0.1)}
      className={`flex min-h-0 flex-col rounded-[1.75rem] border border-text/[0.06] bg-surface shadow-card ${className}`}
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <h2 id="situation-title" className="font-heading text-lg font-bold tracking-tight">
            My Situation
          </h2>
          <p className="mt-0.5 font-body text-xs text-text/60">Used to match you with similar stories</p>
        </div>
        <Link
          to={paths.intake}
          aria-label={hasDetails ? 'Edit situation details' : 'Add situation details'}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 font-body text-sm font-semibold text-primary transition-colors duration-200 outline-none hover:bg-primary-light focus-visible:ring-2 focus-visible:ring-primary"
        >
          <PencilSimple size={16} aria-hidden="true" />
          {hasDetails ? 'Edit' : 'Add'}
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <dl className="flex flex-col gap-3">
          {facts.map((fact) => (
            <motion.div key={fact.id} variants={fadeUpVariants} className="flex items-center gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-light text-primary"
                aria-hidden="true"
              >
                {fact.icon}
              </span>
              <div className="min-w-0">
                <dt className="font-body text-xs text-text/55">{fact.label}</dt>
                <dd
                  className={`font-body text-sm leading-snug break-words ${
                    fact.value ? 'font-medium' : 'text-text/45'
                  }`}
                >
                  {fact.value ?? 'Not added yet'}
                </dd>
              </div>
            </motion.div>
          ))}
        </dl>

        {details && (
          <motion.div variants={fadeUpVariants} className="mt-5 border-t border-text/[0.06] pt-4">
            <h3 className={sectionLabelClassName}>What happened</h3>
            <p className="mt-2 line-clamp-4 font-body text-sm leading-relaxed text-text/80">{details}</p>
          </motion.div>
        )}

        {interests.length > 0 && (
          <motion.div variants={fadeUpVariants} className="mt-5 border-t border-text/[0.06] pt-4">
            <h3 className={sectionLabelClassName}>Hoping to hear from</h3>
            <ul className="mt-2 space-y-1.5">
              {interests.map((interest) => (
                <li key={interest} className="flex items-start gap-2 font-body text-sm leading-snug">
                  <CheckCircle size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  {interest}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </div>
    </motion.section>
  )
}
