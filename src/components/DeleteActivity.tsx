'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function DeleteActivity({ id }: { id: number }) {
  const router = useRouter()
  return (
    <button
      onClick={async () => {
        if (!confirm('Remove this entry? It will no longer count toward your group.')) return
        await createClient().rpc('delete_manual_activity', { p_id: id })
        router.refresh()
      }}
      style={{ font: 'inherit', fontSize: '.85rem', color: 'var(--brick)', background: 'none', border: 0, padding: '8px 0', cursor: 'pointer', textDecoration: 'underline' }}
    >Remove</button>
  )
}
