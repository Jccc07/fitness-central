// Turns OCR text from a Strava share image into distance / pace / time.
// Pure function, no browser APIs, so it is easy to test.

export type Parsed = {
  distanceM?: number
  timeS?: number
  unit?: 'km' | 'mi'
  warnings: string[]
}

const MI = 1609.344

export function parseShareText(raw: string): Parsed {
  const warnings: string[] = []
  const out: Parsed = { warnings }
  const text = raw.replace(/\r/g, ' ').replace(/\n/g, ' ')

  // "3.04 mi", "5,02 km". The lookbehind stops "12:10 mi" (a pace) from reading as a distance.
  const d = text.match(/(?<![:\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s*(km|mi|miles?)\b/i)
  if (d) {
    const n = parseFloat(d[1].replace(',', '.'))
    out.unit = d[2].toLowerCase().startsWith('mi') ? 'mi' : 'km'
    out.distanceM = n * (out.unit === 'mi' ? MI : 1000)
  }

  // "12:10 /mi" or "6:05 /km"
  let paceS: number | undefined
  let paceUnit: 'km' | 'mi' | undefined
  const p = text.match(/(\d{1,2}):(\d{2})\s*\/?\s*(km|mi)\b/i)
  if (p) {
    paceS = parseInt(p[1], 10) * 60 + parseInt(p[2], 10)
    paceUnit = p[3].toLowerCase() as 'km' | 'mi'
  }

  // "1:02:03" or "37m 4s" or "1h 2m 3s"
  const clock = text.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/)
  if (clock) {
    out.timeS = +clock[1] * 3600 + +clock[2] * 60 + +clock[3]
  } else {
    const t = text.match(/(?:(\d+)\s*h\s*)?(\d{1,2})\s*m(?:in)?(?![a-z])\s*(?:(\d{1,2})\s*s)?/i)
    if (t) out.timeS = (+(t[1] ?? 0)) * 3600 + +t[2] * 60 + +(t[3] ?? 0)
  }

  // Fill a gap from the other two numbers when we can.
  if (paceS && paceUnit) {
    const unitM = paceUnit === 'mi' ? MI : 1000
    if (out.distanceM && !out.timeS) {
      out.timeS = Math.round(paceS * (out.distanceM / unitM))
      warnings.push('Time was worked out from distance and pace. Please check it.')
    } else if (out.timeS && !out.distanceM) {
      out.distanceM = (out.timeS / paceS) * unitM
      out.unit = paceUnit
      warnings.push('Distance was worked out from time and pace. Please check it.')
    } else if (out.timeS && out.distanceM) {
      const expected = paceS * (out.distanceM / unitM)
      if (Math.abs(expected - out.timeS) / out.timeS > 0.1) {
        warnings.push('Distance, pace and time do not quite agree. Check them against your screenshot.')
      }
    }
  }
  return out
}
