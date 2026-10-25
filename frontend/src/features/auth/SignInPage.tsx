import { AppleLogo, ArrowLeft, CircleNotch, GoogleLogo } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { paths } from '../../app/paths.ts'
import { SiteHeader } from '../../components/layout/SiteHeader.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { Field } from '../../components/ui/Field.tsx'
import { PasswordInput } from '../../components/ui/PasswordInput.tsx'
import { TextInput } from '../../components/ui/TextInput.tsx'
import { easeOutQuint } from '../../styles/motion.ts'
import type { AuthProvider, AuthUser, SignInLocationState } from '../../types/auth.ts'
import { useAuth } from './AuthContext.ts'
import { AuthRecap } from './AuthRecap.tsx'

type AuthMode = 'sign-up' | 'sign-in'
type FieldName = 'name' | 'email' | 'password'
type FieldErrors = Partial<Record<FieldName, string>>

const modes: { value: AuthMode; label: string }[] = [
  { value: 'sign-up', label: 'Create account' },
  { value: 'sign-in', label: 'Sign in' },
]

const modeCopy: Record<AuthMode, { title: string; description: string; submit: string }> = {
  'sign-up': {
    title: 'Create your free account',
    description: 'Save your answers and explore experiences from people in a similar spot.',
    submit: 'Create account',
  },
  'sign-in': {
    title: 'Welcome back',
    description: 'Sign in to pick up where you left off.',
    submit: 'Sign in',
  },
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const minPasswordLength = 8
const mockSignInDelay = 900

function getNameFromEmail(email: string) {
  const localPart = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim() ?? ''
  return localPart.replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Driver'
}

function describedBy(id: string, error: string | undefined, hasHint = false) {
  if (error) {
    return `${id}-error`
  }
  return hasHint ? `${id}-hint` : undefined
}

type SocialButtonProps = {
  icon: ReactNode
  label: string
  isPending: boolean
  disabled: boolean
  onClick: () => void
}

function SocialButton({ icon, label, isPending, disabled, onClick }: SocialButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-text/15 bg-surface font-body text-sm font-semibold transition-[border-color,background-color,transform] duration-200 ease-out outline-none hover:border-primary/40 hover:bg-background focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
    >
      {isPending ? (
        <CircleNotch size={18} className="animate-spin" aria-hidden="true" />
      ) : (
        <span aria-hidden="true">{icon}</span>
      )}
      {label}
    </button>
  )
}

export function SignInPage() {
  const { user, signIn } = useAuth()
  const location = useLocation()
  const redirectTo = (location.state as SignInLocationState)?.from ?? paths.chat

  const [mode, setMode] = useState<AuthMode>('sign-up')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [pendingProvider, setPendingProvider] = useState<AuthProvider | null>(null)
  const signInTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (signInTimer.current !== null) {
        window.clearTimeout(signInTimer.current)
      }
    }
  }, [])

  if (user) {
    return <Navigate to={redirectTo} replace />
  }

  const copy = modeCopy[mode]
  const isPending = pendingProvider !== null
  const isSignUp = mode === 'sign-up'

  function completeSignIn(nextUser: AuthUser) {
    setPendingProvider(nextUser.provider)
    signInTimer.current = window.setTimeout(() => signIn(nextUser), mockSignInDelay)
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setErrors({})
  }

  function clearError(field: FieldName) {
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) {
      return
    }

    const nextErrors: FieldErrors = {}
    if (isSignUp && !name.trim()) {
      nextErrors.name = 'Enter your name.'
    }
    if (!emailPattern.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.'
    }
    if (password.length < minPasswordLength) {
      nextErrors.password = `Use at least ${minPasswordLength} characters.`
    }
    setErrors(nextErrors)

    const firstInvalid = (['name', 'email', 'password'] as const).find((field) => nextErrors[field])
    if (firstInvalid) {
      document.getElementById(`auth-${firstInvalid}`)?.focus()
      return
    }

    completeSignIn({
      name: isSignUp ? name.trim() : getNameFromEmail(email.trim()),
      email: email.trim(),
      provider: 'email',
    })
  }

  function handleSocialSignIn(provider: Exclude<AuthProvider, 'email'>) {
    completeSignIn({
      name: 'Jordan Lee',
      email: provider === 'google' ? 'jordan.lee@gmail.com' : 'jordan.lee@icloud.com',
      provider,
    })
  }

  return (
    <div className="min-h-svh bg-background text-text">
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-6 pt-2 pb-20 sm:px-8 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-start lg:gap-14">
        <AuthRecap className="order-2 lg:order-1 lg:sticky lg:top-10" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easeOutQuint }}
          className="order-1 lg:order-2"
        >
          <Link
            to={paths.intakeInterests}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full font-body text-sm font-medium text-muted outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to your answers
          </Link>

          <section
            aria-labelledby="auth-title"
            className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-card sm:p-8"
          >
            <div role="group" aria-label="Account options" className="grid grid-cols-2 rounded-full bg-background p-1">
              {modes.map((option) => {
                const isActive = option.value === mode
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => switchMode(option.value)}
                    disabled={isPending}
                    className={`relative h-10 rounded-full font-body text-sm font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      isActive ? 'text-text' : 'text-text/55 hover:text-text'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="auth-mode-indicator"
                        transition={{ duration: 0.25, ease: easeOutQuint }}
                        className="absolute inset-0 rounded-full bg-surface shadow-card"
                      />
                    )}
                    <span className="relative">{option.label}</span>
                  </button>
                )
              })}
            </div>

            <h1
              id="auth-title"
              className="mt-7 font-heading text-2xl leading-tight font-extrabold tracking-[-0.02em] sm:text-3xl"
            >
              {copy.title}
            </h1>
            <p className="mt-2 font-body text-sm leading-relaxed text-muted">{copy.description}</p>

            <div className="mt-6 grid gap-3">
              <SocialButton
                icon={<GoogleLogo size={18} />}
                label="Continue with Google"
                isPending={pendingProvider === 'google'}
                disabled={isPending}
                onClick={() => handleSocialSignIn('google')}
              />
              <SocialButton
                icon={<AppleLogo size={18} />}
                label="Continue with Apple"
                isPending={pendingProvider === 'apple'}
                disabled={isPending}
                onClick={() => handleSocialSignIn('apple')}
              />
            </div>

            <div className="my-6 flex items-center gap-3 font-body text-xs text-text/50">
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              or use your email
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>

            <form onSubmit={handleSubmit} noValidate className="grid gap-5">
              {isSignUp && (
                <Field id="auth-name" label="Name" error={errors.name}>
                  <TextInput
                    id="auth-name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      clearError('name')
                    }}
                    disabled={isPending}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={describedBy('auth-name', errors.name)}
                    placeholder="Your name"
                  />
                </Field>
              )}

              <Field id="auth-email" label="Email" error={errors.email}>
                <TextInput
                  id="auth-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    clearError('email')
                  }}
                  disabled={isPending}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={describedBy('auth-email', errors.email)}
                  placeholder="you@example.com"
                />
              </Field>

              <Field
                id="auth-password"
                label="Password"
                hint={isSignUp ? `At least ${minPasswordLength} characters.` : undefined}
                error={errors.password}
              >
                <PasswordInput
                  id="auth-password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    clearError('password')
                  }}
                  disabled={isPending}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={describedBy('auth-password', errors.password, isSignUp)}
                />
              </Field>

              <Button type="submit" size="lg" aria-busy={isPending} className="mt-1 w-full">
                {pendingProvider === 'email' && (
                  <CircleNotch size={18} className="animate-spin" aria-hidden="true" />
                )}
                {pendingProvider === 'email' ? 'Just a moment…' : copy.submit}
              </Button>
            </form>
          </section>
        </motion.div>
      </main>
    </div>
  )
}
