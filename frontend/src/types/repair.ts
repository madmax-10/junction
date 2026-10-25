export type RepairOutcomeStatus = 'resolved' | 'unresolved' | 'unsure'

// `resolution_details` on a repair issue (backend/common/validators.py).
export type RepairResolution = {
  method: 'mechanic' | 'self'
  work_performed?: string
  instructions?: string
  parts_used?: string[]
  cost?: number
  mechanic_name?: string
  location?: string
  insurance_settlement?: string
}

// A chat turn that touched a repair outcome without producing a post.
export type RepairOutcomePrompt = {
  issueId: string
  status?: RepairOutcomeStatus
  resolution?: Partial<RepairResolution>
}

export type RepairIssueOutcome = {
  id: string
  status: 'open' | RepairOutcomeStatus
  resolution: RepairResolution | null
}
