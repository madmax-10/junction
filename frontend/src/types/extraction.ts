export type ExtractedDetail =
  | { field: 'make' | 'model' | 'year' | 'trim' | 'mileage'; value: string; evidence: string }
  | {
      field: 'details' | 'insuranceSettlement' | 'minBudget' | 'maxBudget'
      value: string
      evidence: string
    }

export type SuggestionStatus = 'pending' | 'confirmed' | 'dismissed'

export type DetailSuggestion = ExtractedDetail & {
  id: string
  status: SuggestionStatus
}
