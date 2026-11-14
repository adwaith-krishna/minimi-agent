// src/app/signup/page.tsx
// Sign-up page — creates a new account via Supabase Auth.
// Saves validated IANA timezone (with Asia/Kolkata fallback) to the user profile.
// Uses Server Actions for secure credential handling.
// Sanitizes user-facing error messages to prevent raw internal leaks.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { sanitizeTimezone } from '@/lib/utils/timezone'
import { getSafeAuthErrorMessage, mapSupabaseErrorToCode, logAuthDiagnostic } from '@/lib/utils/auth'

interface SignupPageProps {
  searchParams: Promise<{ error?: string }>
}

async function signup(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const email = (formData.get('email') as string)?.trim() ?? ''
  const password = (formData.get('password') as string) ?? ''
  const displayName = (formData.get('displayName') as string)?.trim() ?? ''

  // Validate the client-submitted timezone against IANA identifiers; fallback to Asia/Kolkata
  const rawTimezone = formData.get('timezone')
  const timezone = sanitizeTimezone(rawTimezone, 'Asia/Kolkata')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || email.split('@')[0],
        timezone,
      },
      emailRedirectTo: `${appUrl}/auth/callback`,
    },
  })

  if (error) {
    const safeErrorCode = mapSupabaseErrorToCode(error.message, true)
    logAuthDiagnostic('signup_failure', safeErrorCode, error.status)
    redirect(`/signup?error=${encodeURIComponent(safeErrorCode)}`)
  }

  // Show confirmation page after successful signup (email confirmation flow)
  redirect('/signup/confirm')
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams
  const safeErrorMessage = getSafeAuthErrorMessage(params.error)

  return (
    <div className="auth-shell">
      <section className="auth-visual"><a className="wordmark" href="/signup" style={{ color: 'white' }}>minimi</a><h1>Look back. Check what changed. Move forward.</h1><p>Your private research workspace starts here.</p></section>
      <div className="auth-form-wrap"><div className="auth-form">
        <p className="panel-kicker">Start your workspace</p>
        <h1>Create your account</h1>
        <p>Keep your research history ready for the next question.</p>

        {safeErrorMessage && (
          <div
            role="alert"
            className="auth-error"
          >
            {safeErrorMessage}
          </div>
        )}

        <form action={signup}>
          {/* Timezone is populated by the inline script below and validated on submission */}
          <input type="hidden" name="timezone" id="timezone-field" value="Asia/Kolkata" />

          <div className="field">
            <label htmlFor="displayName" className="text-sm font-medium">
              Name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

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
              autoComplete="new-password"
              minLength={8}
              placeholder="At least 8 characters"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <button
            type="submit"
            className="button button-primary auth-submit"
          >
            Create account
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-zinc-900 underline dark:text-zinc-100">
            Sign in
          </Link>
        </p>
      </div></div>

      {/* Detect browser timezone on first load; validated server-side on submit */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            try {
              var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
              if (tz) document.getElementById('timezone-field').value = tz;
            } catch(e) {}
          `,
        }}
      />
    </div>
  )
}
