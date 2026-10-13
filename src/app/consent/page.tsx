import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CONSENT_VERSION, hasCurrentConsent } from '@/lib/consent'
import ConsentForm from '@/components/ConsentForm'

export default async function ConsentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (await hasCurrentConsent()) redirect('/')

  return (
    <main className="hero">
      <h1>Before you start</h1>
      <div className="panel" style={{ textAlign: 'left' }}>
        <h2>What your group sees</h2>
        <p style={{ margin: 0 }}>Fitness Central copies your walks, jogs and runs from Strava. Members of your group see your <b>total distance</b> for each week and since you joined, plus the short note you post.</p>
        <h2>What stays private</h2>
        <p style={{ margin: 0 }}>Nobody else sees your routes, activity names, times, pace or anything else from Strava. Your own History is visible only to you.</p>
        <h2>Your control</h2>
        <p style={{ margin: 0 }}>Leave your group or withdraw this agreement any time from the Group tab. If you disconnect Strava from your Strava settings, we delete your synced activities.</p>
        <ConsentForm version={CONSENT_VERSION} />
      </div>
    </main>
  )
}
