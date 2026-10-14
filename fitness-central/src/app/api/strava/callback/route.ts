import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCode, saveTokens, syncUser } from '@/lib/strava'

export async function GET(req: NextRequest) {
  const site = process.env.NEXT_PUBLIC_SITE_URL!
  const back = (reason: string) => NextResponse.redirect(`${site}/connect?error=${reason}`)
  const p = req.nextUrl.searchParams
  const code = p.get('code')
  const state = p.get('state')

  if (p.get('error') || !code || !state || state !== req.cookies.get('strava_state')?.value) return back('denied')
  if (!(p.get('scope') ?? '').includes('activity:read')) return back('scope')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${site}/login`)

  try {
    const tok = await exchangeCode(code)
    const admin = createAdminClient()
    const { error } = await admin.from('strava_links').upsert({
      user_id: user.id,
      athlete_id: tok.athlete.id,
      scope: p.get('scope'),
    })
    if (error) return back('taken') // this Strava account is linked to another user
    await saveTokens(user.id, tok)
    await syncUser(user.id, 30)
  } catch (e) {
    console.error('Strava connect failed', e)
    return back('failed')
  }
  const res = NextResponse.redirect(`${site}/`)
  res.cookies.delete({ name: 'strava_state', path: '/api/strava' })
  return res
}
