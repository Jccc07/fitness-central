'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function WithdrawConsent() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <section className="stack">
      <h2>Privacy</h2>
      <p className="muted" style={{ margin: 0 }}>Withdrawing removes you from your group so nobody sees your distance. You will be asked to agree again before you can rejoin.</p>
      <button className="btn danger" disabled={busy} onClick={async () => {
        if (!confirm('Withdraw your sharing agreement and leave your group?')) return
        setBusy(true)
        await createClient().rpc('withdraw_consent')
        router.replace('/consent')
        router.refresh()
      }}>Withdraw agreement</button>
    </section>
  )
}
