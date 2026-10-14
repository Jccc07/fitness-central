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

  // Strava is optional: people can add activities from screenshots instead.
  const { data: link } = await supabase.from('strava_links').select('last_synced_at').maybeSingle()

  return (
    <>
      {link && <AutoSync lastSyncedAt={link.last_synced_at} />}
      {children}
      <BottomNav />
    </>
  )
}
