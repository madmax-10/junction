import type { AccidentType, CurrentSituation } from './intake.ts'

export type ExtractedDetail =
  | { field: 'make' | 'model' | 'year' | 'mileage'; value: string; evidence: string }
  | { field: 'accidentType'; value: AccidentType; evidence: string }
  | { field: 'situation'; value: CurrentSituation; evidence: string }

export type SuggestionStatus = 'pending' | 'confirmed' | 'dismissed'

export type DetailSuggestion = ExtractedDetail & {
  id: string
  status: SuggestionStatus
}
