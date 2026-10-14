import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import RaceTrack from '@/components/RaceTrack'
import NoteEditor from '@/components/NoteEditor'
import Standings from '@/components/Standings'
import { shortDate } from '@/lib/format'

export default async function RacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const me = user!

  const { data: membership } = await supabase.from('group_members').select('group_id, note').maybeSingle()

  if (!membership) {
    return (
      <>
        <header className="race-head"><h1>Race</h1></header>
        <div className="stage">
          <div className="layer clouds" /><div className="layer hills-far" /><div className="layer hills-near" />
          <div className="ground" />
          <div className="empty-stage">
            <p>Join a group to race your friends across the landscape.</p>
            <Link className="btn" href="/group">Join or start a group</Link>
          </div>
        </div>
        <main className="page">
          <p className="muted">Your own runs and walks from Strava are in History.</p>
        </main>
      </>
    )
  }

  const [{ data: standings }, { data: range }, { data: group }] = await Promise.all([
    supabase.rpc('group_standings', { p_group_id: membership.group_id, p_weeks_ago: 0 }),
    supabase.rpc('group_week_range', { p_group_id: membership.group_id, p_weeks_ago: 0 }),
    supabase.from('groups').select('name').eq('id', membership.group_id).single(),
  ])
  const runners = (standings ?? []) as any[]
  const w = (range as any[] | null)?.[0]

  return (
    <>
      <header className="race-head">
        <div>
          <h1>{group?.name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {w ? `Week of ${shortDate(w.week_start, w.tz)} · resets Monday` : 'This week'}
          </p>
        </div>
      </header>
      <RaceTrack runners={runners} meId={me.id} />
      <main className="page">
        <NoteEditor groupId={membership.group_id} userId={me.id} initial={membership.note ?? ''} />
        <section className="stack">
          <h2>This week</h2>
          <Standings rows={runners} meId={me.id} />
        </section>
      </main>
    </>
  )
}
