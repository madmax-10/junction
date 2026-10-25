export type AccidentType = 'rear-end' | 'front-collision' | 'side-impact' | 'weather-damage' | 'other'

export type CurrentSituation = 'repair-estimate' | 'total-loss' | 'figuring-out'

export type LearningInterest = 'repair' | 'sell' | 'buy' | 'not-sure'

export type VehicleInfo = {
  make: string | null
  model: string | null
  year: string | null
  mileage: string
  trim: string
}

export type IntakeDraft = {
  accidentType: AccidentType | null
  situation: CurrentSituation | null
  details: string
  vehicle: VehicleInfo
  interests: LearningInterest[]
  question: string
  insuranceSettlement: string
  minBudget: string
  maxBudget: string
}

export type IntakeFields = Omit<IntakeDraft, 'vehicle'>

export type SituationField = keyof IntakeFields | keyof VehicleInfo

export type SituationSection = 'vehicle' | 'accident' | 'insurance' | 'concerns'

export type SectionStatus = 'confirmed' | 'unconfirmed' | 'missing'

export type FieldConfirmation = Record<SituationField, boolean>

export type SituationChanges = {
  fields?: Partial<IntakeFields>
  vehicle?: Partial<VehicleInfo>
}
