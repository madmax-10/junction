import { Car, Check, Plus, TriangleAlert, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { fadeUpVariants, staggerVariants } from '../../styles/motion.ts'
import type { SituationSection } from '../../types/intake.ts'
import { useAuth } from '../auth/AuthContext.ts'
import { useIntakeDraft } from '../intake/IntakeContext.ts'
import { hasAccidentDetails, hasVehicleDetails } from './startingDetails.ts'

type ChatDetailsPromptProps = {
  onEdit: (section: SituationSection) => void
}

type RequiredItem = {
  section: SituationSection
  title: string
  description: string
  icon: LucideIcon
  isDone: boolean
}

export function ChatDetailsPrompt({ onEdit }: ChatDetailsPromptProps) {
  const { user } = useAuth()
  const { draft } = useIntakeDraft()
  const firstName = user?.name.split(' ')[0]

  const items: RequiredItem[] = [
    {
      section: 'vehicle',
      title: 'Vehicle',
      description: 'Make, model, year, and mileage',
      icon: Car,
      isDone: hasVehicleDetails(draft),
    },
    {
      section: 'accident',
      title: 'What happened',
      description: 'The type of accident or a short description',
      icon: TriangleAlert,
      isDone: hasAccidentDetails(draft),
    },
  ]

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerVariants(0.07, 0.1)}
      className="mx-auto flex min-h-full max-w-2xl flex-col justify-center py-2"
    >
      <motion.h2
        variants={fadeUpVariants}
        className="font-heading text-xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-2xl"
      >
        {firstName ? `Hi ${firstName}, tell me about your car first` : 'Tell me about your car first'}
      </motion.h2>
      <motion.p variants={fadeUpVariants} className="mt-1.5 max-w-lg font-body text-sm leading-relaxed text-muted">
        Add your vehicle and what happened in My Situation. As soon as you save, I’ll look for people who went
        through something similar.
      </motion.p>

      <motion.ul variants={staggerVariants(0.06)} aria-label="Details needed to start" className="mt-6 grid gap-2.5 sm:grid-cols-2">
        {items.map((item) => (
          <motion.li key={item.section} variants={fadeUpVariants}>
            <button
              type="button"
              onClick={() => onEdit(item.section)}
              className={`group flex h-full w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-[border-color,box-shadow,transform] duration-200 ease-out outline-none hover:-translate-y-0.5 hover:shadow-card focus-visible:ring-1 active:translate-y-0 ${
                item.isDone
                  ? 'border-primary/30 bg-primary-light/40 hover:border-primary/35 focus-visible:border-primary focus-visible:ring-primary'
                  : 'border-dashed border-text/25 bg-surface hover:border-secondary/35 focus-visible:border-secondary focus-visible:ring-secondary'
              }`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-xl ${
                  item.isDone ? 'bg-primary-light text-primary' : 'bg-secondary-light text-secondary'
                }`}
                aria-hidden="true"
              >
                <item.icon size={16} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-body text-sm font-semibold">{item.title}</span>
                <span className="mt-0.5 block font-body text-xs leading-snug text-muted">{item.description}</span>
              </span>
              <span
                className={`mt-0.5 inline-flex shrink-0 items-center gap-1 font-body text-[0.7rem] font-semibold ${
                  item.isDone ? 'text-primary' : 'text-secondary'
                }`}
              >
                {item.isDone ? (
                  <>
                    <Check size={14} strokeWidth={2.25} aria-hidden="true" />
                    Added
                  </>
                ) : (
                  <>
                    <Plus size={14} strokeWidth={2} aria-hidden="true" />
                    Add
                  </>
                )}
              </span>
            </button>
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  )
}
