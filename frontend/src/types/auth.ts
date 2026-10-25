export type AuthProvider = 'email' | 'google' | 'apple'

export type AuthUser = {
  name: string
  email: string
  provider: AuthProvider
}

export type SignInLocationState = {
  from?: string
} | null
