'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Preview = { group_name: string; member_count: number; is_full: boolean }

export default function GroupForms() {
  const router = useRouter()
  const supabase = createClient()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const { error } = await supabase.rpc('create_group', { p_name: name, p_timezone: tz })
    setBusy(false)
    if (error) setError(error.message)
    else router.refresh()
  }

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setPreview(null)
    const { data, error } = await supabase.rpc('preview_group', { p_code: code })
    setBusy(false)
    if (error) return setError(error.message)
    const row = (data as Preview[] | null)?.[0]
    if (!row) setError('No group matches that code. Check it and try again.')
    else if (row.is_full) setError(`${row.group_name} is full (10 of 10 members).`)
    else setPreview(row)
  }

  async function confirmJoin() {
    setBusy(true); setError('')
    const { data, error } = await supabase.rpc('join_group', { p_code: code })
    setBusy(false)
    if (error) return setError(error.message)
    if (data === 'ok') return router.refresh()
    setPreview(null)
    setError(data === 'full' ? 'That group just filled up.' : data === 'already_in_group' ? 'You are already in a group.' : 'No group matches that code.')
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Join with a code</h2>
        {preview ? (
          <div className="stack">
            <p>Join <b>{preview.group_name}</b>? It has {preview.member_count} of 10 members.</p>
            <div className="row">
              <button className="btn" onClick={confirmJoin} disabled={busy}>{busy ? 'Joining…' : 'Join group'}</button>
              <button className="btn plain" onClick={() => setPreview(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        ) : (
          <form className="stack" onSubmit={lookup}>
            <label htmlFor="code">Group code</label>
            <div className="row">
              <input id="code" type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6} autoCapitalize="characters" autoComplete="off" placeholder="ABC234" />
              <button className="btn" disabled={busy || code.length < 6}>Find group</button>
            </div>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>Start a new group</h2>
        <form className="stack" onSubmit={create}>
          <label htmlFor="gname">Group name</label>
          <div className="row">
            <input id="gname" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Sunday joggers" />
            <button className="btn" disabled={busy || !name.trim()}>Create</button>
          </div>
        </form>
      </section>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
