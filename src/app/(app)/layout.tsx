import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BottomNav from '@/components/BottomNav'
import { AutoSync } from '@/components/Sync'
import { hasCurrentConsent } from '@/lib/consent'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await hasCurrentConsent())) redirect('/consent')

  // Strava is required: no link yet means onboarding isn't finished.
  const { data: link } = await supabase.from('strava_links').select('last_synced_at').maybeSingle()
  if (!link) redirect('/connect')

  return (
    <>
      <AutoSync lastSyncedAt={link.last_synced_at} />
      {children}
      <BottomNav />
    </>
  )
}
