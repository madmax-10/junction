import type { PostData, PostDraft, PostIssueType } from '../../types/post.ts'

export type PostForm = {
  title: string
  content: string
  make: string
  model: string
  year: string
  trim: string
  mileage: string
  askingPrice: string
  location: string
  knownDamage: string
  mechanical: string
  exterior: string
  interior: string
  maintenanceHistory: string
  phone: string
  email: string
  link: string
  minBudget: string
  maxBudget: string
  preferredMakes: string
  preferredModels: string
  minimumYear: string
  maximumMileage: string
  vehicleType: '' | 'new' | 'used'
  fuelType: string
  confirmedSymptoms: string
  inferredSymptoms: string
  method: '' | 'mechanic' | 'self'
  workPerformed: string
  cost: string
  mechanicName: string
  insuranceSettlement: string
  photos: string[]
}

export type PostFormErrors = Partial<Record<keyof PostForm, string>>

// Character limits match backend/posts/validation.py and common/validators.py.
export const fieldLimits: Partial<Record<keyof PostForm, number>> = {
  title: 255,
  make: 100,
  model: 100,
  trim: 100,
  location: 255,
  knownDamage: 2000,
  mechanical: 1000,
  exterior: 1000,
  interior: 1000,
  maintenanceHistory: 1000,
  phone: 50,
  email: 255,
  link: 500,
  fuelType: 50,
  workPerformed: 2000,
  mechanicName: 100,
  insuranceSettlement: 500,
}

export const maxPhotos = 8

function numberText(value: number | undefined) {
  return value === undefined ? '' : String(value)
}

export function toPostForm(post: PostDraft): PostForm {
  const data = post.postData
  return {
    title: post.title,
    content: post.content,
    make: data.make ?? '',
    model: data.model ?? '',
    year: numberText(data.year),
    trim: data.trim ?? '',
    mileage: numberText(data.mileage),
    askingPrice: numberText(data.asking_price),
    location: data.location ?? '',
    knownDamage: data.known_damage ?? '',
    mechanical: data.condition_details?.mechanical ?? '',
    exterior: data.condition_details?.exterior ?? '',
    interior: data.condition_details?.interior ?? '',
    maintenanceHistory: data.condition_details?.maintenance_history ?? '',
    phone: data.contact?.phone ?? '',
    email: data.contact?.email ?? '',
    link: data.contact?.link ?? '',
    minBudget: numberText(data.min_budget),
    maxBudget: numberText(data.max_budget),
    preferredMakes: data.preferred_makes?.join(', ') ?? '',
    preferredModels: data.preferred_models?.join(', ') ?? '',
    minimumYear: numberText(data.minimum_year),
    maximumMileage: numberText(data.maximum_mileage),
    vehicleType: data.vehicle_type ?? '',
    fuelType: data.fuel_type ?? '',
    confirmedSymptoms: data.symptoms?.confirmed?.join('\n') ?? '',
    inferredSymptoms: data.symptoms?.inferred?.join('\n') ?? '',
    method: data.method ?? '',
    workPerformed: data.work_performed ?? '',
    cost: numberText(data.cost),
    mechanicName: data.mechanic_name ?? '',
    insuranceSettlement: data.insurance_settlement ?? '',
    photos: data.photos ?? [],
  }
}

function list(value: string, separator: RegExp) {
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean)
}

function wholeNumber(value: string) {
  const cleaned = value.replace(/[,\s]/g, '')
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null
}

function money(value: string) {
  const cleaned = value.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  return Number(cleaned)
}

type Builder = {
  data: PostData
  errors: PostFormErrors
  form: PostForm
}

function setText(builder: Builder, field: keyof PostForm, key: keyof PostData) {
  const value = String(builder.form[field]).trim()
  if (!value) return
  const limit = fieldLimits[field]
  if (limit && value.length > limit) {
    builder.errors[field] = `Use ${limit} characters or fewer.`
    return
  }
  ;(builder.data as Record<string, unknown>)[key] = value
}

function setWhole(builder: Builder, field: keyof PostForm, key: keyof PostData, label: string) {
  const raw = String(builder.form[field]).trim()
  if (!raw) return
  const value = wholeNumber(raw)
  if (value === null) {
    builder.errors[field] = `Enter ${label} as a whole number.`
    return
  }
  ;(builder.data as Record<string, unknown>)[key] = value
}

function setYear(builder: Builder, field: keyof PostForm, key: keyof PostData) {
  const raw = String(builder.form[field]).trim()
  if (!raw) return
  const value = wholeNumber(raw)
  const maximum = new Date().getFullYear() + 1
  if (value === null || value < 1900 || value > maximum) {
    builder.errors[field] = `Enter a year between 1900 and ${maximum}.`
    return
  }
  ;(builder.data as Record<string, unknown>)[key] = value
}

function setMoney(builder: Builder, field: keyof PostForm, key: keyof PostData) {
  const raw = String(builder.form[field]).trim()
  if (!raw) return
  const value = money(raw)
  if (value === null) {
    builder.errors[field] = 'Enter an amount like 14500 or 180.50.'
    return
  }
  ;(builder.data as Record<string, unknown>)[key] = value
}

function setVehicle(builder: Builder) {
  setText(builder, 'make', 'make')
  setText(builder, 'model', 'model')
  setYear(builder, 'year', 'year')
  setText(builder, 'trim', 'trim')
  setWhole(builder, 'mileage', 'mileage', 'mileage')
}

function setContact(builder: Builder) {
  const { form, errors } = builder
  const contact: NonNullable<PostData['contact']> = {}
  const phone = form.phone.trim()
  const email = form.email.trim()
  const link = form.link.trim()
  if (phone) {
    if (phone.length > 50) errors.phone = 'Use 50 characters or fewer.'
    else contact.phone = phone
  }
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.'
    else contact.email = email
  }
  if (link) {
    if (!/^https?:\/\//.test(link)) errors.link = 'Start the link with http:// or https://.'
    else if (link.length > 500) errors.link = 'Use 500 characters or fewer.'
    else contact.link = link
  }
  if (Object.keys(contact).length > 0) builder.data.contact = contact
}

// Builds the full `post_data` object. PATCH replaces it, so every kept field must be included.
export function fromPostForm(issueType: PostIssueType, form: PostForm) {
  const builder: Builder = { data: {}, errors: {}, form }
  const { data, errors } = builder

  if (!form.title.trim()) errors.title = 'Add a title.'
  else if (form.title.trim().length > 255) errors.title = 'Use 255 characters or fewer.'
  if (!form.content.trim()) errors.content = 'Add the post text.'

  if (issueType === 'sell') {
    setVehicle(builder)
    setMoney(builder, 'askingPrice', 'asking_price')
    setText(builder, 'location', 'location')
    setText(builder, 'knownDamage', 'known_damage')
    const condition: NonNullable<PostData['condition_details']> = {}
    for (const [field, key] of [
      ['mechanical', 'mechanical'],
      ['exterior', 'exterior'],
      ['interior', 'interior'],
      ['maintenanceHistory', 'maintenance_history'],
    ] as const) {
      const value = form[field].trim()
      if (!value) continue
      if (value.length > 1000) errors[field] = 'Use 1000 characters or fewer.'
      else condition[key] = value
    }
    if (Object.keys(condition).length > 0) data.condition_details = condition
  }

  if (issueType === 'buy') {
    setMoney(builder, 'minBudget', 'min_budget')
    setMoney(builder, 'maxBudget', 'max_budget')
    if (data.min_budget !== undefined && data.max_budget !== undefined && data.max_budget < data.min_budget) {
      errors.maxBudget = 'The maximum can’t be less than the minimum.'
    }
    const makes = list(form.preferredMakes, /,/)
    const models = list(form.preferredModels, /,/)
    if (makes.length > 0) data.preferred_makes = makes
    if (models.length > 0) data.preferred_models = models
    setYear(builder, 'minimumYear', 'minimum_year')
    setWhole(builder, 'maximumMileage', 'maximum_mileage', 'mileage')
    if (form.vehicleType) data.vehicle_type = form.vehicleType
    setText(builder, 'fuelType', 'fuel_type')
    setText(builder, 'location', 'location')
  }

  if (issueType === 'repair') {
    setVehicle(builder)
    const confirmed = list(form.confirmedSymptoms, /\n/)
    const inferred = list(form.inferredSymptoms, /\n/)
    if (confirmed.some((item) => item.length > 300)) errors.confirmedSymptoms = 'Keep each symptom to 300 characters.'
    if (inferred.some((item) => item.length > 300)) errors.inferredSymptoms = 'Keep each symptom to 300 characters.'
    if (confirmed.length > 0 || inferred.length > 0) {
      data.symptoms = {
        ...(confirmed.length > 0 ? { confirmed } : {}),
        ...(inferred.length > 0 ? { inferred } : {}),
      }
    }
    if (form.method) data.method = form.method
    setText(builder, 'workPerformed', 'work_performed')
    setMoney(builder, 'cost', 'cost')
    if (form.method !== 'self') setText(builder, 'mechanicName', 'mechanic_name')
    setText(builder, 'insuranceSettlement', 'insurance_settlement')
    data.owner_reported = true
  }

  if (issueType !== 'repair') setContact(builder)
  if (form.photos.length > maxPhotos) errors.photos = `Choose up to ${maxPhotos} photos.`
  else if (form.photos.length > 0) data.photos = form.photos

  return { postData: data, errors, isValid: Object.keys(errors).length === 0 }
}
