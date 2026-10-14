import { createClient } from '@/lib/supabase/server'
import GroupForms from '@/components/GroupForms'
import { CopyCode, LeaveGroup } from '@/components/GroupActions'
import WithdrawConsent from '@/components/WithdrawConsent'

export default async function GroupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = await supabase.from('group_members').select('group_id, groups(name, code)').maybeSingle()
  const group = (membership as any)?.groups

  let members: any[] = []
  if (membership) {
    const { data } = await supabase.rpc('group_standings', { p_group_id: membership.group_id })
    members = (data ?? []) as any[]
  }

  return (
    <main className="page">
      <h1>Group</h1>
      {!membership ? (
        <GroupForms />
      ) : (
        <>
          <section className="stack">
            <h2>{group?.name}</h2>
            <p className="muted" style={{ margin: 0 }}>{members.length} of 10 members. Share this code with friends:</p>
            <div className="code" aria-label={`Group code ${group?.code}`}>{group?.code}</div>
            <div className="row"><CopyCode code={group?.code} /></div>
          </section>
          <section className="stack">
            <h2>Members</h2>
            <ul className="acts">
              {members.map((m) => <li key={m.user_id}><span /><span>{m.display_name}{m.user_id === user?.id ? ' (you)' : ''}</span><span /></li>)}
            </ul>
          </section>
          <LeaveGroup />
        </>
      )}
      <WithdrawConsent />
      <form action="/auth/signout" method="post"><button className="btn plain">Sign out</button></form>
    </main>
  )
}
