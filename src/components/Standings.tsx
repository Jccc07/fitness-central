import { km } from '@/lib/format'
import type { Runner } from './RaceTrack'

export default function Standings({ rows, meId }: { rows: Runner[]; meId: string }) {
  return (
    <ol className="board">
      {rows.map((r, i) => (
        <li key={r.user_id} className={r.user_id === meId ? 'me' : undefined}>
          <span className="rank">{i + 1}</span>
          <span className="dot">{r.avatar_url ? <img src={r.avatar_url} alt="" referrerPolicy="no-referrer" /> : r.display_name.slice(0, 1).toUpperCase()}</span>
          <span>{r.user_id === meId ? `${r.display_name} (you)` : r.display_name}</span>
          <span className="dist">{km(r.distance_m)} km</span>
        </li>
      ))}
    </ol>
  )
}
