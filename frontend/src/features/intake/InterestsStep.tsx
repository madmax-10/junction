import { motion } from 'motion/react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../app/paths.ts'
import { ChoiceCard } from '../../components/ui/ChoiceCard.tsx'
import { TextArea } from '../../components/ui/TextArea.tsx'
import { staggerVariants } from '../../styles/motion.ts'
import type { LearningInterest } from '../../types/intake.ts'
import { useAuth } from '../auth/AuthContext.ts'
import { IntakeActions } from './IntakeActions.tsx'
import { useIntakeDraft } from './IntakeContext.ts'
import { IntakeQuestion } from './IntakeQuestion.tsx'
import { IntakeStepLayout } from './IntakeStepLayout.tsx'
import { questionMaxLength } from './intakeLimits.ts'
import { interestOptions, notSureInterest, toggleInterest } from './intakeOptions.tsx'

export function InterestsStep() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { draft, updateDraft, confirmSections } = useIntakeDraft()
  const canSubmit = draft.interests.length > 0

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canSubmit) {
      confirmSections(['concerns'])
      navigate(user ? paths.chat : paths.signIn)
    }
  }

  return (
    <IntakeStepLayout
      step={3}
      title="What would you like to learn?"
      description="Pick the experiences you’d like to hear about from people in a similar spot."
    >
      <motion.form
        onSubmit={handleSubmit}
        initial="hidden"
        animate="visible"
        variants={staggerVariants(0.08, 0.15)}
        className="flex flex-col gap-10"
      >
        <IntakeQuestion number={1} title="Whose experiences would help?" hint="Choose all that apply">
          <div className="grid gap-3 sm:grid-cols-2">
            {interestOptions.map((option) => (
              <div
                key={option.value}
                className={option.value === notSureInterest ? 'sm:col-span-2' : undefined}
              >
                <ChoiceCard
                  multiple
                  name="interests"
                  value={option.value}
                  label={option.label}
                  description={option.description}
                  icon={option.icon}
                  checked={draft.interests.includes(option.value)}
                  onSelect={(value) =>
                    updateDraft({
                      interests: toggleInterest(draft.interests, value as LearningInterest),
                    })
                  }
                />
              </div>
            ))}
          </div>
        </IntakeQuestion>

        <IntakeQuestion number={2} title="Anything specific you’re wondering about?" hint="Optional">
          <label htmlFor="intake-question" className="sr-only">
            Anything specific you’re wondering about?
          </label>
          <TextArea
            id="intake-question"
            rows={3}
            maxLength={questionMaxLength}
            value={draft.question}
            onChange={(event) => updateDraft({ question: event.target.value })}
            placeholder="e.g. Was it worth repairing a car with frame damage?"
            aria-describedby="intake-question-count"
          />
          <p
            id="intake-question-count"
            className="mt-2 text-right font-body text-xs text-text/55 tabular-nums"
          >
            {draft.question.length}/{questionMaxLength}
          </p>
        </IntakeQuestion>

        <IntakeActions
          backTo={paths.intakeVehicle}
          canContinue={canSubmit}
          incompleteHint="Choose at least one option to continue"
        />
      </motion.form>
    </IntakeStepLayout>
  )
}
