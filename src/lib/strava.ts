import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

const API = 'https://www.strava.com/api/v3'
// Walking, jogging and running only. Add 'Hike' here if you want it later.
const COUNTED = new Set(['Run', 'TrailRun', 'VirtualRun', 'Walk'])

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      ...body,
    }),
  })
  if (!res.ok) throw new Error(`Strava token request failed (${res.status})`)
  return res.json()
}

export const exchangeCode = (code: string) => tokenRequest({ code, grant_type: 'authorization_code' })

export async function saveTokens(userId: string, tok: any) {
  const admin = createAdminClient()
  const { error } = await admin.from('strava_tokens').upsert({
    user_id: userId,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: new Date(tok.expires_at * 1000).toISOString(),
  })
  if (error) throw error
}

async function accessTokenFor(userId: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('strava_tokens').select('*').eq('user_id', userId).single()
  if (error || !data) throw new Error('No Strava tokens for user')
  if (new Date(data.expires_at).getTime() - Date.now() > 60_000) return data.access_token
  const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: data.refresh_token })
  await saveTokens(userId, fresh)
  return fresh.access_token
}

function toRow(userId: string, a: any) {
  const type = a.sport_type ?? a.type
  if (!COUNTED.has(type)) return null
  return {
    user_id: userId,
    source: 'strava',
    external_id: a.id,
    activity_type: type,
    name: a.name ?? null,
    distance_m: a.distance ?? 0,
    moving_time_s: a.moving_time ?? 0,
    start_date: a.start_date,
  }
}

/** Pull recent activities. First sync backfills `backfillDays`; later syncs overlap by a day. */
export async function syncUser(userId: string, backfillDays = 30) {
  const admin = createAdminClient()
  const token = await accessTokenFor(userId)
  const { data: link } = await admin.from('strava_links').select('last_synced_at').eq('user_id', userId).single()
  const since = link?.last_synced_at
    ? new Date(link.last_synced_at).getTime() - 24 * 3600 * 1000
    : Date.now() - backfillDays * 24 * 3600 * 1000

  let imported = 0
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`${API}/athlete/activities?after=${Math.floor(since / 1000)}&per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Strava activities request failed (${res.status})`)
    const batch: any[] = await res.json()
    const rows = batch.map((a) => toRow(userId, a)).filter(Boolean)
    if (rows.length) {
      const { error } = await admin.from('activities').upsert(rows as any[], { onConflict: 'source,external_id' })
      if (error) throw error
      imported += rows.length
    }
    if (batch.length < 100) break
  }
  await admin.from('strava_links').update({ last_synced_at: new Date().toISOString() }).eq('user_id', userId)
  return imported
}

/** Handle one Strava webhook event. Strava does not sign events, so we never trust the payload:
 *  we only use it to decide WHAT to re-fetch from Strava with the athlete's own token. */
export async function handleWebhookEvent(event: any) {
  const admin = createAdminClient()
  const { data: link } = await admin.from('strava_links').select('user_id').eq('athlete_id', event.owner_id).maybeSingle()
  if (!link) return
  const userId = link.user_id as string

  if (event.object_type === 'athlete') {
    if (event.updates?.authorized === 'false') {
      // Athlete revoked access: remove their Strava data and tokens (required by Strava's terms).
      await admin.from('activities').delete().eq('user_id', userId).eq('source', 'strava')
      await admin.from('strava_tokens').delete().eq('user_id', userId)
      await admin.from('strava_links').delete().eq('user_id', userId)
    }
    return
  }

  if (event.object_type !== 'activity') return
  if (event.aspect_type === 'delete') {
    await admin.from('activities').delete().eq('source', 'strava').eq('external_id', event.object_id).eq('user_id', userId)
    return
  }
  const token = await accessTokenFor(userId)
  const res = await fetch(`${API}/activities/${event.object_id}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return
  const row = toRow(userId, await res.json())
  if (row) await admin.from('activities').upsert(row, { onConflict: 'source,external_id' })
  else await admin.from('activities').delete().eq('source', 'strava').eq('external_id', event.object_id).eq('user_id', userId)
}
