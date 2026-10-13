'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LoginInner() {
  const failed = useSearchParams().get('error')
  const [busy, setBusy] = useState(false)
  return (
    <main className="hero">
      <h1>Fitness Central</h1>
      <p>Walk, jog or run. See how far you and your friends get this week.</p>
      <div className="panel">
        <button className="btn" disabled={busy} onClick={async () => {
          setBusy(true)
          await createClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback` } })
        }}>{busy ? 'Opening Google…' : 'Continue with Google'}</button>
        {failed && <p className="error" role="alert">Sign-in did not finish. Please try again.</p>}
      </div>
    </main>
  )
}
export default function LoginPage() { return <Suspense><LoginInner /></Suspense> }
