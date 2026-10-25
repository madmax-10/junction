export type AccidentType = 'rear-end' | 'front-collision' | 'side-impact' | 'weather-damage' | 'other'

export type CurrentSituation = 'repair-estimate' | 'total-loss' | 'figuring-out'

export type LearningInterest = 'repaired' | 'sold' | 'replaced' | 'insurance-settlement' | 'not-sure'

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
}
