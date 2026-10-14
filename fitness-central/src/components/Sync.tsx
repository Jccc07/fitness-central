'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

async function runSync() {
  const r = await fetch('/api/strava/sync', { method: 'POST' })
  return r.ok ? ((await r.json()) as { skipped?: boolean }) : null
}

/** Webhooks do the real-time work; this catches anything missed when the app is opened. */
export function AutoSync({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const router = useRouter()
  useEffect(() => {
    const stale = !lastSyncedAt || Date.now() - new Date(lastSyncedAt).getTime() > 10 * 60 * 1000
    if (!stale) return
    runSync().then((j) => j && !j.skipped && router.refresh()).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export function SyncButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      className="btn plain"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await runSync().catch(() => {})
        setBusy(false)
        router.refresh()
      }}
    >
      {busy ? 'Syncing…' : 'Sync from Strava'}
    </button>
  )
}
