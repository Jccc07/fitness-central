'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ConsentForm({ version }: { version: number }) {
  const router = useRouter()
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await createClient().rpc('accept_consent', { p_version: version })
    if (error) { setBusy(false); return setError('Could not save your choice. Try again.') }
    router.replace('/connect')
    router.refresh()
  }

  return (
    <form className="stack" onSubmit={submit} style={{ textAlign: 'left' }}>
      <label style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 24, height: 24, marginTop: 2 }} />
        <span>I agree that my distance totals are shown to the members of my group.</span>
      </label>
      <button className="btn" disabled={!agreed || busy}>{busy ? 'Saving…' : 'Agree and continue'}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}
