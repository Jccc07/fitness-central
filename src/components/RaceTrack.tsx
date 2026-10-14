'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export type Runner = { user_id: string; display_name: string; avatar_url: string | null; note: string; distance_m: number }

const MAX_KM = 50
const VISIBLE_KM = 10
const GUTTER_L = 72
const GUTTER_R = 140

export default function RaceTrack({ runners, meId }: { runners: Runner[]; meId: string }) {
  const stage = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const inited = useRef(false)
  const [pxPerKm, setPxPerKm] = useState(40)
  const [view, setView] = useState({ left: 0, width: 0 })

  // ~10 km fits the screen at first; wider screens simply show more track.
  useEffect(() => {
    const el = scroller.current!
    const measure = () => {
      setPxPerKm(Math.max(36, (el.clientWidth - GUTTER_L) / VISIBLE_KM))
      setView({ left: el.scrollLeft, width: el.clientWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const xOf = useCallback((m: number) => GUTTER_L + Math.min(m / 1000, MAX_KM) * pxPerKm, [pxPerKm])

  // Start with the signed-in runner in view, a quarter of the way in.
  useEffect(() => {
    if (inited.current || !view.width) return
    const me = runners.find((r) => r.user_id === meId)
    if (me) scroller.current!.scrollLeft = Math.max(0, xOf(me.distance_m) - view.width * 0.25)
    inited.current = true
  }, [view.width, runners, meId, xOf])

  const raf = useRef(0)
  const onScroll = () => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const el = scroller.current!
      stage.current!.style.setProperty('--sx', String(el.scrollLeft)) // parallax
      setView({ left: el.scrollLeft, width: el.clientWidth })
    })
  }

  const ranked = [...runners].sort((a, b) => b.distance_m - a.distance_m)
  const ahead = ranked.filter((r) => xOf(r.distance_m) > view.left + view.width - 20).length
  const behind = ranked.filter((r) => xOf(r.distance_m) < view.left + 20).length
  const worldW = GUTTER_L + MAX_KM * pxPerKm + GUTTER_R
  const page = (dir: 1 | -1) => scroller.current!.scrollBy({ left: dir * view.width * 0.8, behavior: 'smooth' })
  const marks = Array.from({ length: MAX_KM / 5 + 1 }, (_, i) => i * 5)

  return (
    <div className="stage" ref={stage}>
      <div className="layer clouds" />
      <div className="layer hills-far" />
      <div className="layer hills-near" />

      <div className="scroller" ref={scroller} onScroll={onScroll} tabIndex={0} role="region" aria-label="Race track. Scroll sideways to see friends further ahead.">
        <div className="world" style={{ width: worldW }}>
          <div className="ground" />
          <div className="flag start" style={{ left: xOf(0) }} aria-hidden />
          {marks.filter((k) => k > 0 && k < MAX_KM).map((k) =>
            k % 10 === 0
              ? <div key={k} className="block" style={{ left: xOf(k * 1000) }} aria-hidden>{k}km</div>
              : <div key={k} className="sign" style={{ left: xOf(k * 1000) }} aria-hidden>{k} km</div>
          )}
          {[20, 40].map((k) => <div key={k} className="pipe" style={{ left: xOf(k * 1000) + pxPerKm * 2.5 }} aria-hidden />)}
          <div className="flag" style={{ left: xOf(MAX_KM * 1000) }} aria-hidden />

          {ranked.map((r, i) => {
            const km = r.distance_m / 1000
            const style = { left: xOf(r.distance_m), ['--row' as string]: i % 4 } as React.CSSProperties
            return (
              <div key={r.user_id} className={`runner${r.user_id === meId ? ' me' : ''}`} style={style}>
                {r.note && <div className="bubble">{r.note}</div>}
                {i === 0 && km > 0 && <span className="crown" aria-hidden>👑</span>}
                <div className="avatar" aria-hidden>
                  {r.avatar_url ? <img src={r.avatar_url} alt="" referrerPolicy="no-referrer" /> : r.display_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="tag"><b>{r.user_id === meId ? 'You' : r.display_name}</b><span>{km >= MAX_KM ? '50+' : km.toFixed(1)} km</span></div>
              </div>
            )
          })}
        </div>
      </div>

      {behind > 0 && <button className="chip left" onClick={() => page(-1)}>◀ {behind} behind</button>}
      {ahead > 0 && <button className="chip right" onClick={() => page(1)}>{ahead} ahead, scroll ▶</button>}
    </div>
  )
}
