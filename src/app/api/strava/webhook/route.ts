import { NextResponse, type NextRequest } from 'next/server'
import { handleWebhookEvent } from '@/lib/strava'

// Strava subscription handshake (one-time, see README).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ 'hub.challenge': p.get('hub.challenge') })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// Strava expects a 200 within 2 seconds; always answer 200 and log failures.
export async function POST(req: NextRequest) {
  try {
    await handleWebhookEvent(await req.json())
  } catch (e) {
    console.error('Strava webhook error', e)
  }
  return NextResponse.json({ ok: true })
}
