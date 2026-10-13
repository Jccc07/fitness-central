import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncUser } from '@/lib/strava'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: link } = await supabase.from('strava_links').select('last_synced_at').maybeSingle()
  if (!link) return NextResponse.json({ error: 'not_connected' }, { status: 400 })
  if (link.last_synced_at && Date.now() - new Date(link.last_synced_at).getTime() < 60_000) {
    return NextResponse.json({ skipped: true }) // basic throttle to protect Strava rate limits
  }
  try {
    return NextResponse.json({ imported: await syncUser(user.id) })
  } catch (e) {
    console.error('Strava sync failed', e)
    return NextResponse.json({ error: 'sync_failed' }, { status: 502 })
  }
}
