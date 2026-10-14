'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseShareText, type Parsed } from '@/lib/parseShare'
import { prepareForOcr } from '@/lib/ocrImage'

type Draft = { dist: string; unit: 'km' | 'mi'; h: string; m: string; s: string; date: string; type: 'Run' | 'Walk' }

const isoDay = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}
const blank = (): Draft => ({ dist: '', unit: 'km', h: '', m: '', s: '', date: isoDay(), type: 'Run' })

async function readImage(file: File, onProgress: (p: number) => void): Promise<Parsed> {
  // Runs entirely in the browser. Only the OCR engine and English language file are downloaded.
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress(m.progress) },
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    let last: Parsed = { warnings: [] }
    for (const variant of ['clean', 'raw'] as const) {
      const { data } = await worker.recognize(await prepareForOcr(file, variant))
      last = parseShareText(data.text)
      if (last.distanceM && last.timeS) break
    }
    return last
  } finally {
    await worker.terminate()
  }
}

export default function ScreenshotUpload() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function reset() { setOpen(false); setDraft(null); setNotes([]); setPreview(null); setError(''); setReading(null) }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(''); setNotes([]); setReading(0)
    setPreview(URL.createObjectURL(file))
    try {
      const p = await readImage(file, setReading)
      const d = blank()
      if (p.distanceM) {
        d.unit = p.unit ?? 'km'
        d.dist = (p.distanceM / (d.unit === 'mi' ? 1609.344 : 1000)).toFixed(2)
      }
      if (p.timeS) {
        d.h = p.timeS >= 3600 ? String(Math.floor(p.timeS / 3600)) : ''
        d.m = String(Math.floor((p.timeS % 3600) / 60))
        d.s = String(p.timeS % 60)
      }
      const found = !!(p.distanceM && p.timeS)
      setNotes(found ? p.warnings : ['We could not read everything from that image. Please fill in the missing values.'])
      setDraft(d)
    } catch {
      setError('Could not read that image. You can type the numbers in instead.')
      setDraft(blank())
    } finally {
      setReading(null)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    const unitM = draft.unit === 'mi' ? 1609.344 : 1000
    const distance = parseFloat(draft.dist.replace(',', '.')) * unitM
    const time = (+draft.h || 0) * 3600 + (+draft.m || 0) * 60 + (+draft.s || 0)
    if (!(distance > 0) || !(time > 0)) return setError('Enter a distance and a time.')
    setBusy(true); setError('')
    const { error } = await createClient().rpc('add_manual_activity', {
      p_distance_m: Math.round(distance * 10) / 10,
      p_moving_time_s: time,
      p_start_date: new Date(`${draft.date}T12:00:00`).toISOString(),
      p_type: draft.type,
    })
    setBusy(false)
    if (error) return setError(error.message)
    reset()
    router.refresh()
  }

  const set = (k: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  if (!open) return <button className="btn" onClick={() => setOpen(true)}>Add a walk or run</button>

  return (
    <div className="panel">
      <h2>Add a walk or run</h2>
      {!draft && reading === null && (
        <div className="stack">
          <label className="btn" style={{ cursor: 'pointer' }}>
            Choose a Strava screenshot
            <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <button className="btn plain" onClick={() => setDraft(blank())}>Type it in instead</button>
          <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>
            Works best with Strava's share images that show distance, pace and time. The image is read on your device and never saved.
          </p>
        </div>
      )}

      {reading !== null && <p role="status">Reading your screenshot… {Math.round(reading * 100)}%</p>}

      {draft && (
        <form className="stack" onSubmit={save}>
          {preview && <img src={preview} alt="Your screenshot" style={{ maxHeight: 160, objectFit: 'contain', borderRadius: 10, background: '#333' }} />}
          {preview && <p className="muted" style={{ margin: 0 }}>Check these against your screenshot before saving.</p>}
          {notes.map((n) => <p key={n} className="error" style={{ margin: 0 }}>{n}</p>)}

          <label htmlFor="sd">Distance</label>
          <div className="row">
            <input id="sd" type="text" inputMode="decimal" value={draft.dist} onChange={(e) => set('dist', e.target.value)} placeholder="5.00" />
            <select aria-label="Unit" value={draft.unit} onChange={(e) => set('unit', e.target.value)} style={{ minHeight: 48, fontSize: 16 }}>
              <option value="km">km</option><option value="mi">mi</option>
            </select>
          </div>

          <label htmlFor="sh">Time</label>
          <div className="row">
            <input id="sh" type="text" inputMode="numeric" aria-label="Hours" value={draft.h} onChange={(e) => set('h', e.target.value)} placeholder="h" />
            <input type="text" inputMode="numeric" aria-label="Minutes" value={draft.m} onChange={(e) => set('m', e.target.value)} placeholder="min" />
            <input type="text" inputMode="numeric" aria-label="Seconds" value={draft.s} onChange={(e) => set('s', e.target.value)} placeholder="sec" />
          </div>

          <label htmlFor="sdate">Date</label>
          <input id="sdate" type="date" min={isoDay(-14)} max={isoDay()} value={draft.date} onChange={(e) => set('date', e.target.value)}
            style={{ minHeight: 48, fontSize: 16, padding: '0 12px', border: '3px solid var(--ink)', borderRadius: 12 }} />

          <label htmlFor="stype">Type</label>
          <select id="stype" value={draft.type} onChange={(e) => set('type', e.target.value)} style={{ minHeight: 48, fontSize: 16 }}>
            <option value="Run">Run or jog</option><option value="Walk">Walk</option>
          </select>

          <div className="row">
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn plain" onClick={reset} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {!draft && reading === null && <button className="btn plain" onClick={reset}>Cancel</button>}
    </div>
  )
}
