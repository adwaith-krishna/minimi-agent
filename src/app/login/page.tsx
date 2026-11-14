// src/app/login/page.tsx
// Sign-in page — handles email/password login.
// Uses Server Actions for secure credential handling.
// Sanitizes redirect destinations and provides safe generic error messages.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSafeRedirectUrl } from '@/lib/utils/url'
import { getSafeAuthErrorMessage, mapSupabaseErrorToCode, logAuthDiagnostic } from '@/lib/utils/auth'

interface LoginPageProps {
  searchParams: Promise<{ error?: string; redirectTo?: string }>
}

async function login(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const email = (formData.get('email') as string)?.trim() ?? ''
  const password = (formData.get('password') as string) ?? ''
  const rawRedirectTo = formData.get('redirectTo') as string
  const safeRedirect = getSafeRedirectUrl(rawRedirectTo, '/chat')

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const safeErrorCode = mapSupabaseErrorToCode(error.message, false)
    logAuthDiagnostic('login_failure', safeErrorCode, error.status)
    redirect(`/login?error=${encodeURIComponent(safeErrorCode)}&redirectTo=${encodeURIComponent(safeRedirect)}`)
  }

  redirect(safeRedirect)
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const safeErrorMessage = getSafeAuthErrorMessage(params.error)
  const safeRedirect = getSafeRedirectUrl(params.redirectTo, '/chat')

  return (
    <div className="auth-shell">
      <section className="auth-visual"><a className="wordmark" href="/login" style={{ color: 'white' }}>minimi</a><h1>Research that remembers what came before.</h1><p>Temporal memory, current evidence, and clear answers in one place.</p></section>
      <div className="auth-form-wrap"><div className="auth-form">
        <p className="panel-kicker">Welcome back</p>
        <h1>Sign in to Minimi</h1>
        <p>Pick up your research where you left off.</p>

        {safeErrorMessage && (
          <div
            role="alert"
            className="auth-error"
          >
            {safeErrorMessage}
          </div>
        )}

        <form action={login}>
          <input type="hidden" name="redirectTo" value={safeRedirect} />

          <div className="field">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <div className="field">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <button
            type="submit"
            className="button button-primary auth-submit"
          >
            Sign in
          </button>
        </form>

        <p className="auth-footer">
          No account?{' '}
          <Link href="/signup" className="font-medium text-zinc-900 underline dark:text-zinc-100">
            Sign up
          </Link>
        </p>
      </div></div>
    </div>
  )
}
