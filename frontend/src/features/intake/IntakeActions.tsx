import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { Button } from '../../components/ui/Button.tsx'
import { ButtonLink } from '../../components/ui/ButtonLink.tsx'
import { fadeUpVariants } from '../../styles/motion.ts'

type IntakeActionsProps = {
  backTo: string
  canContinue: boolean
  incompleteHint: string
}

export function IntakeActions({ backTo, canContinue, incompleteHint }: IntakeActionsProps) {
  return (
    <motion.div
      variants={fadeUpVariants}
      className="flex flex-col-reverse gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <ButtonLink to={backTo} variant="secondary" size="lg">
        <ArrowLeft size={18} aria-hidden="true" />
        Back
      </ButtonLink>
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <Button type="submit" size="lg" disabled={!canContinue} aria-describedby="continue-hint">
          Continue
          <ArrowRight
            size={18}
            className="transition-transform duration-200 ease-out group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Button>
        <p
          id="continue-hint"
          className={`font-body text-xs text-muted sm:text-right ${canContinue ? 'sr-only' : ''}`}
          aria-live="polite"
        >
          {canContinue ? 'Ready to continue' : incompleteHint}
        </p>
      </div>
    </motion.div>
  )
}
