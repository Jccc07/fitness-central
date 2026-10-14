import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export async function GET() {
  const state = randomBytes(16).toString('hex')
  const url = new URL('https://www.strava.com/oauth/authorize')
  url.searchParams.set('client_id', process.env.STRAVA_CLIENT_ID!)
  url.searchParams.set('redirect_uri', `${process.env.NEXT_PUBLIC_SITE_URL}/api/strava/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', 'read,activity:read')
  url.searchParams.set('state', state)
  const res = NextResponse.redirect(url)
  res.cookies.set('strava_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/strava',
  })
  return res
}
