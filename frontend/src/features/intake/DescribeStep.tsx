import { motion } from 'motion/react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../app/paths.ts'
import { ChoiceCard } from '../../components/ui/ChoiceCard.tsx'
import { TextArea } from '../../components/ui/TextArea.tsx'
import { staggerVariants } from '../../styles/motion.ts'
import type { AccidentType, CurrentSituation } from '../../types/intake.ts'
import { IntakeActions } from './IntakeActions.tsx'
import { useIntakeDraft } from './IntakeContext.ts'
import { IntakeQuestion } from './IntakeQuestion.tsx'
import { IntakeStepLayout } from './IntakeStepLayout.tsx'
import { detailsMaxLength } from './intakeLimits.ts'
import { accidentTypeOptions, situationOptions } from './intakeOptions.tsx'

export function DescribeStep() {
  const navigate = useNavigate()
  const { draft, updateDraft, confirmSections } = useIntakeDraft()
  const canContinue = draft.accidentType !== null && draft.situation !== null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canContinue) {
      confirmSections(['accident', 'insurance'])
      navigate(paths.intakeVehicle)
    }
  }

  return (
    <IntakeStepLayout
      step={1}
      title="Tell us what happened."
      description="A few quick answers help us find people whose situation looked like yours."
    >
      <motion.form
        onSubmit={handleSubmit}
        initial="hidden"
        animate="visible"
        variants={staggerVariants(0.08, 0.15)}
        className="flex flex-col gap-10"
      >
        <IntakeQuestion number={1} title="What happened to your car?">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {accidentTypeOptions.map((option) => (
              <ChoiceCard
                key={option.value}
                name="accidentType"
                orientation="tile"
                value={option.value}
                label={option.label}
                description={option.description}
                icon={option.icon}
                checked={draft.accidentType === option.value}
                onSelect={(value) => updateDraft({ accidentType: value as AccidentType })}
              />
            ))}
          </div>
        </IntakeQuestion>

        <IntakeQuestion number={2} title="Where do things stand right now?">
          <div className="flex flex-col gap-3">
            {situationOptions.map((option) => (
              <ChoiceCard
                key={option.value}
                name="situation"
                value={option.value}
                label={option.label}
                description={option.description}
                icon={option.icon}
                checked={draft.situation === option.value}
                onSelect={(value) => updateDraft({ situation: value as CurrentSituation })}
              />
            ))}
          </div>
        </IntakeQuestion>

        <IntakeQuestion number={3} title="Anything else?" hint="Optional">
          <label htmlFor="intake-details" className="sr-only">
            Tell us a little more
          </label>
          <TextArea
            id="intake-details"
            rows={4}
            maxLength={detailsMaxLength}
            value={draft.details}
            onChange={(event) => updateDraft({ details: event.target.value })}
            placeholder="Tell us a little more..."
            aria-describedby="intake-details-count"
          />
          <p
            id="intake-details-count"
            className="mt-2 text-right font-body text-xs text-text/55 tabular-nums"
          >
            {draft.details.length}/{detailsMaxLength}
          </p>
        </IntakeQuestion>

        <IntakeActions
          backTo={paths.home}
          canContinue={canContinue}
          incompleteHint="Choose what happened and where things stand to continue"
        />
      </motion.form>
    </IntakeStepLayout>
  )
}
