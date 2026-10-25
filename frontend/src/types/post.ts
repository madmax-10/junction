export type PostIssueType = 'buy' | 'sell' | 'repair'

export type PostStatus = 'draft' | 'approved' | 'published' | 'archived'

export type PostContact = {
  phone?: string
  email?: string
  link?: string
}

// The `post_data` keys the backend accepts for each issue type (backend/agent/contracts.md §4).
export type PostData = {
  make?: string
  model?: string
  year?: number
  trim?: string
  mileage?: number
  asking_price?: number
  condition_details?: {
    mechanical?: string
    exterior?: string
    interior?: string
    maintenance_history?: string
  }
  known_damage?: string
  location?: string
  contact?: PostContact
  photos?: string[]
  min_budget?: number
  max_budget?: number
  preferred_makes?: string[]
  preferred_models?: string[]
  minimum_year?: number
  maximum_mileage?: number
  vehicle_type?: 'new' | 'used'
  fuel_type?: string
  symptoms?: { confirmed?: string[]; inferred?: string[] }
  method?: 'mechanic' | 'self'
  work_performed?: string
  cost?: number
  mechanic_name?: string
  owner_reported?: true
  insurance_settlement?: string
}

export type PostDraft = {
  id: string
  issueType: PostIssueType
  issueId: string
  title: string
  content: string
  postData: PostData
  status: PostStatus
}
