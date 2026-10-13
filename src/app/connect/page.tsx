import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasCurrentConsent } from '@/lib/consent'

const messages: Record<string, string> = {
  denied: 'Strava access was cancelled. Connect again to continue.',
  scope: 'Please leave "View data about your activities" ticked so we can count your distance.',
  taken: 'That Strava account is already linked to another Fitness Central user.',
  failed: 'Something went wrong while connecting. Try again in a moment.',
}

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await hasCurrentConsent())) redirect('/consent')
  const { data: link } = await supabase.from('strava_links').select('user_id').maybeSingle()
  if (link) redirect('/')

  return (
    <main className="hero">
      <h1>Connect Strava</h1>
      <p>Your walks and runs sync automatically, so there is nothing to log by hand.</p>
      <div className="panel">
        <a className="btn strava" href="/api/strava/connect">Connect with Strava</a>
        {error && <p className="error" role="alert">{messages[error] ?? messages.failed}</p>}
        <form action="/auth/signout" method="post"><button className="btn plain" style={{ width: '100%' }}>Sign out</button></form>
      </div>
    </main>
  )
}
