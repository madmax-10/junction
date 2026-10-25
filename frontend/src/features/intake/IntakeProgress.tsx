import { motion } from 'motion/react'
import { easeOutQuint } from '../../styles/motion.ts'

type IntakeProgressProps = {
  currentStep: number
  totalSteps: number
}

export function IntakeProgress({ currentStep, totalSteps }: IntakeProgressProps) {
  return (
    <div className="flex items-center gap-3">
      <p className="font-body text-sm font-semibold text-primary">
        Step {currentStep} of {totalSteps}
      </p>
      <div
        role="progressbar"
        aria-label="Intake progress"
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-valuenow={currentStep}
        className="flex gap-1.5"
      >
        {Array.from({ length: totalSteps }, (_, index) => {
          const step = index + 1
          return (
            <span key={step} className="h-1.5 w-8 overflow-hidden rounded-full bg-text/10">
              {step <= currentStep && (
                <motion.span
                  className="block h-full origin-left rounded-full bg-primary"
                  initial={{ scaleX: step === currentStep ? 0 : 1 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.35, delay: 0.15, ease: easeOutQuint }}
                />
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
