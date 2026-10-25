import { motion } from 'motion/react'
import { useEffect, useRef, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../app/paths.ts'
import { Combobox } from '../../components/ui/Combobox.tsx'
import { Field } from '../../components/ui/Field.tsx'
import { TextInput } from '../../components/ui/TextInput.tsx'
import { vehicleCatalog, vehicleMakes, vehicleYears } from '../../mocks/vehicleCatalog.ts'
import { staggerVariants } from '../../styles/motion.ts'
import { IntakeActions } from './IntakeActions.tsx'
import { useIntakeDraft } from './IntakeContext.ts'
import { IntakeQuestion } from './IntakeQuestion.tsx'
import { IntakeStepLayout } from './IntakeStepLayout.tsx'

const mileageMaxDigits = 7

function formatMileage(digits: string) {
  return digits ? Number(digits).toLocaleString('en-US') : ''
}

export function VehicleStep() {
  const navigate = useNavigate()
  const { draft, updateVehicle } = useIntakeDraft()
  const { vehicle } = draft
  const modelInputRef = useRef<HTMLInputElement>(null)
  const shouldFocusModel = useRef(false)

  const models = vehicle.make ? (vehicleCatalog[vehicle.make] ?? []) : []
  const canContinue = Boolean(vehicle.make && vehicle.model && vehicle.year && vehicle.mileage)

  useEffect(() => {
    if (shouldFocusModel.current) {
      shouldFocusModel.current = false
      modelInputRef.current?.focus()
    }
  }, [vehicle.make])

  function handleMakeChange(make: string | null) {
    if (make === vehicle.make) return
    shouldFocusModel.current = make !== null
    updateVehicle({ make, model: null })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canContinue) {
      navigate(paths.intakeInterests)
    }
  }

  return (
    <IntakeStepLayout
      step={2}
      title="Let’s get to know your car."
      description="People who drove something similar often faced the same repair and value questions."
    >
      <motion.form
        onSubmit={handleSubmit}
        initial="hidden"
        animate="visible"
        variants={staggerVariants(0.08, 0.15)}
        className="flex flex-col gap-10"
      >
        <IntakeQuestion number={1} title="Which car is it?">
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field id="vehicle-make" label="Manufacturer">
              <Combobox
                id="vehicle-make"
                options={vehicleMakes}
                value={vehicle.make}
                onChange={handleMakeChange}
                placeholder="Search manufacturers"
                allowCustomValue
                emptyMessage="Keep typing to add your manufacturer"
              />
            </Field>

            <Field id="vehicle-model" label="Model">
              <Combobox
                id="vehicle-model"
                inputRef={modelInputRef}
                options={models}
                value={vehicle.model}
                onChange={(model) => updateVehicle({ model })}
                disabled={!vehicle.make}
                placeholder={vehicle.make ? `Search ${vehicle.make} models` : 'Choose a manufacturer first'}
                allowCustomValue
                emptyMessage="Type your model to add it"
              />
            </Field>

            <Field id="vehicle-year" label="Year">
              <Combobox
                id="vehicle-year"
                options={vehicleYears}
                value={vehicle.year}
                onChange={(year) => updateVehicle({ year })}
                placeholder="Select year"
                inputMode="numeric"
                emptyMessage={`Choose a year from ${vehicleYears[vehicleYears.length - 1]} to ${vehicleYears[0]}`}
              />
            </Field>

            <Field id="vehicle-trim" label="Trim" optional>
              <TextInput
                id="vehicle-trim"
                value={vehicle.trim}
                maxLength={40}
                autoComplete="off"
                onChange={(event) => updateVehicle({ trim: event.target.value })}
                placeholder="e.g. EX, SE, Limited"
              />
            </Field>
          </div>
        </IntakeQuestion>

        <IntakeQuestion number={2} title="About how many miles are on it?">
          <div className="sm:max-w-xs">
            <Field id="vehicle-mileage" label="Mileage" hint="An estimate from your dashboard is fine.">
              <TextInput
                id="vehicle-mileage"
                inputMode="numeric"
                autoComplete="off"
                suffix="miles"
                placeholder="e.g. 48,000"
                value={formatMileage(vehicle.mileage)}
                onChange={(event) =>
                  updateVehicle({
                    mileage: event.target.value
                      .replace(/\D/g, '')
                      .replace(/^0+(?=\d)/, '')
                      .slice(0, mileageMaxDigits),
                  })
                }
                aria-describedby="vehicle-mileage-hint"
              />
            </Field>
          </div>
        </IntakeQuestion>

        <IntakeActions
          backTo={paths.intake}
          canContinue={canContinue}
          incompleteHint="Add the manufacturer, model, year, and mileage to continue"
        />
      </motion.form>
    </IntakeStepLayout>
  )
}
