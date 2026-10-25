import { useCallback, useMemo, useReducer, type ReactNode } from 'react'
import type {
  FieldConfirmation,
  IntakeDraft,
  IntakeFields,
  SituationChanges,
  SituationField,
  SituationSection,
  VehicleInfo,
} from '../../types/intake.ts'
import { emptyIntakeDraft, IntakeContext, noFieldsConfirmed } from './IntakeContext.ts'
import { fieldsBySection } from './situationFields.ts'

type IntakeState = {
  draft: IntakeDraft
  confirmed: FieldConfirmation
}

type IntakeAction =
  | { type: 'update'; changes: Partial<IntakeFields> }
  | { type: 'updateVehicle'; changes: Partial<VehicleInfo> }
  | { type: 'confirmSections'; sections: SituationSection[] }
  | { type: 'applyConfirmed'; changes: SituationChanges }
  | { type: 'reset' }

const initialState: IntakeState = { draft: emptyIntakeDraft, confirmed: noFieldsConfirmed }

function getChangedKeys<T extends object>(current: T, changes: Partial<T>) {
  return (Object.keys(changes) as (keyof T & string)[]).filter((key) => !Object.is(changes[key], current[key]))
}

function withFields(confirmed: FieldConfirmation, fields: SituationField[], value: boolean) {
  const next = { ...confirmed }
  fields.forEach((field) => {
    next[field] = value
  })
  return next
}

// A field only counts as confirmed once the user submits or approves it; any later edit needs re-confirming.
function intakeReducer(state: IntakeState, action: IntakeAction): IntakeState {
  switch (action.type) {
    case 'update': {
      const changedKeys = getChangedKeys<IntakeFields>(state.draft, action.changes)
      if (changedKeys.length === 0) return state
      return {
        draft: { ...state.draft, ...action.changes },
        confirmed: withFields(state.confirmed, changedKeys, false),
      }
    }
    case 'updateVehicle': {
      const changedKeys = getChangedKeys(state.draft.vehicle, action.changes)
      if (changedKeys.length === 0) return state
      return {
        draft: { ...state.draft, vehicle: { ...state.draft.vehicle, ...action.changes } },
        confirmed: withFields(state.confirmed, changedKeys, false),
      }
    }
    case 'confirmSections':
      return {
        ...state,
        confirmed: withFields(
          state.confirmed,
          action.sections.flatMap((section) => fieldsBySection[section]),
          true,
        ),
      }
    case 'applyConfirmed': {
      const { fields = {}, vehicle = {} } = action.changes
      const confirmedFields = [...Object.keys(fields), ...Object.keys(vehicle)] as SituationField[]
      return {
        draft: { ...state.draft, ...fields, vehicle: { ...state.draft.vehicle, ...vehicle } },
        confirmed: withFields(state.confirmed, confirmedFields, true),
      }
    }
    case 'reset':
      return initialState
  }
}

export function IntakeProvider({ children }: { children: ReactNode }) {
  const [{ draft, confirmed }, dispatch] = useReducer(intakeReducer, initialState)

  const updateDraft = useCallback(
    (changes: Partial<IntakeFields>) => dispatch({ type: 'update', changes }),
    [],
  )

  const updateVehicle = useCallback(
    (changes: Partial<VehicleInfo>) => dispatch({ type: 'updateVehicle', changes }),
    [],
  )

  const confirmSections = useCallback(
    (sections: SituationSection[]) => dispatch({ type: 'confirmSections', sections }),
    [],
  )

  const applyConfirmedChanges = useCallback(
    (changes: SituationChanges) => dispatch({ type: 'applyConfirmed', changes }),
    [],
  )

  const resetDraft = useCallback(() => dispatch({ type: 'reset' }), [])

  const value = useMemo(
    () => ({ draft, confirmed, updateDraft, updateVehicle, confirmSections, applyConfirmedChanges, resetDraft }),
    [draft, confirmed, updateDraft, updateVehicle, confirmSections, applyConfirmedChanges, resetDraft],
  )

  return <IntakeContext value={value}>{children}</IntakeContext>
}
