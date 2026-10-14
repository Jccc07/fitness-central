export const km = (meters: number, digits = 1) => (Number(meters) / 1000).toFixed(digits)

export function duration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

export function pace(meters: number, seconds: number) {
  if (!meters || !seconds) return ''
  const secPerKm = seconds / (meters / 1000)
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')} /km`
}

export const shortDate = (iso: string, timeZone?: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })
