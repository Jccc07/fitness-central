'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button className="btn plain" onClick={async () => {
      try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
    }}>{copied ? 'Copied' : 'Copy code'}</button>
  )
}

export function LeaveGroup() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button className="btn danger" disabled={busy} onClick={async () => {
      if (!confirm('Leave this group? Your distance will no longer count toward its leaderboard.')) return
      setBusy(true)
      await createClient().rpc('leave_group')
      router.refresh()
    }}>Leave group</button>
  )
}
