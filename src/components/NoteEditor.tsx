'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NoteEditor({ groupId, userId, initial }: { groupId: string; userId: string; initial: string }) {
  const router = useRouter()
  const [note, setNote] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await createClient()
      .from('group_members').update({ note: note.trim() }).eq('group_id', groupId).eq('user_id', userId)
    setBusy(false)
    if (error) setError('Could not save your note. Try again.')
    else router.refresh()
  }

  return (
    <form className="stack" onSubmit={save}>
      <label htmlFor="note">Your note to the group</label>
      <div className="row">
        <input id="note" type="text" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catch me if you can!" />
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Post note'}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  )
}
