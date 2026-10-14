import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Standings from '@/components/Standings'
import { SyncButton } from '@/components/Sync'
import ScreenshotUpload from '@/components/ScreenshotUpload'
import DeleteActivity from '@/components/DeleteActivity'
import { duration, km, pace, shortDate } from '@/lib/format'

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams
  const weeksAgo = Math.min(Math.max(parseInt(w ?? '0', 10) || 0, 0), 52)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const me = user!

  const [{ data: acts }, { data: membership }, { data: link }] = await Promise.all([
    supabase.from('activities').select('id, source, activity_type, name, distance_m, moving_time_s, start_date').order('start_date', { ascending: false }).limit(60),
    supabase.from('group_members').select('group_id, groups(name)').maybeSingle(),
    supabase.from('strava_links').select('user_id').maybeSingle(),
  ])

  let weekRows: any[] = [], overall: any[] = [], range: any = null
  if (membership) {
    const gid = membership.group_id
    const [a, b, c] = await Promise.all([
      supabase.rpc('group_standings', { p_group_id: gid, p_weeks_ago: weeksAgo }),
      supabase.rpc('group_standings', { p_group_id: gid }),
      supabase.rpc('group_week_range', { p_group_id: gid, p_weeks_ago: weeksAgo }),
    ])
    weekRows = (a.data ?? []) as any[]
    overall = (b.data ?? []) as any[]
    range = (c.data as any[] | null)?.[0]
  }
  const groupName = (membership as any)?.groups?.name

  return (
    <main className="page">
      <h1>History</h1>

      {membership && (
        <>
          <section className="stack">
            <h2>{groupName}: all-time</h2>
            <p className="muted" style={{ margin: 0 }}>Distance since each person joined.</p>
            <Standings rows={overall} meId={me.id} />
          </section>

          <section className="stack">
            <div className="week-nav">
              {weeksAgo < 52 ? <Link href={`/history?w=${weeksAgo + 1}`}>◀ Earlier</Link> : <span />}
              <h2>{weeksAgo === 0 ? 'This week' : range ? `Week of ${shortDate(range.week_start, range.tz)}` : `${weeksAgo} weeks ago`}</h2>
              {weeksAgo > 0 ? <Link href={weeksAgo === 1 ? '/history' : `/history?w=${weeksAgo - 1}`}>Later ▶</Link> : <span />}
            </div>
            <Standings rows={weekRows} meId={me.id} />
          </section>
        </>
      )}

      <section className="stack">
        <h2>Your walks and runs</h2>
        <ScreenshotUpload />
        {(acts ?? []).length === 0 && <p className="muted">Nothing yet. Go for a walk, then add it here{link ? ' or sync from Strava' : ''}.</p>}
        <ul className="acts">
          {(acts ?? []).map((a: any) => (
            <li key={a.id}>
              <span aria-hidden style={{ fontSize: '1.4rem' }}>{a.activity_type === 'Walk' ? '🚶' : '🏃'}</span>
              <span>
                <b>{km(a.distance_m, 2)} km</b>
                <div className="meta">{a.source === 'strava' ? a.name : 'Added by you'} · {duration(a.moving_time_s)} · {pace(a.distance_m, a.moving_time_s)}</div>
                {a.source === 'manual' && <DeleteActivity id={a.id} />}
              </span>
              <span className="meta">{shortDate(a.start_date)}</span>
            </li>
          ))}
        </ul>
        {link ? <SyncButton /> : <a className="btn plain" href="/api/strava/connect">Connect Strava</a>}
      </section>
    </main>
  )
}
