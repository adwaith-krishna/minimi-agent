// src/app/signup/confirm/page.tsx
// Post-signup confirmation page — shown after email is submitted.

import Link from 'next/link'

export default function ConfirmPage() {
  return (
    <main className="confirm-shell">
      <div className="confirm-card">
        <div className="confirm-mark">✦</div>
        <p className="confirm-eyebrow">Minimi Agent</p>
        <h1>Check your email</h1>
        <p className="confirm-copy">
          We sent a confirmation link to your email address. Click it to activate your account.
        </p>
        <Link
          href="/login"
          className="confirm-link"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
