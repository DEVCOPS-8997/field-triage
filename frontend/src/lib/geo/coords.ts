/**
 * Coordinate parsing and distance helpers for the map search.
 *
 * Accepted inputs (lat first unless hemisphere letters say otherwise):
 *   30.2, 71.5        30.2 71.5        -33.86;151.21
 *   30.2N 71.5E       30.2° N, 71.5° E
 *   30°12'N 71°30'E   30°12'30"N, 71°30'15"E
 *   71.5E 30.2N       (hemisphere letters fix the order)
 * If the first number is not a valid latitude but the swapped pair is valid, the pair is read
 * as lon, lat and `swapped` is set so the UI can say so.
 */

export interface ParsedCoords {
  lat: number
  lon: number
  /** true when the input was read as "lon, lat" */
  swapped: boolean
}

// degrees [° | space] [minutes '] [seconds "] [hemisphere]
const PART = String.raw`([+-]?\d{1,3}(?:\.\d+)?)\s*°?\s*(?:(\d{1,2}(?:\.\d+)?)\s*['′]\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|″|'')\s*)?([NSEWnsew])?`
const COORD_RE = new RegExp(String.raw`^\s*${PART}\s*(?:[,;]\s*|\s+)${PART}\s*$`)

function toDecimal(deg: string, min?: string, sec?: string, hemi?: string): number {
  const d = Number(deg)
  const sign = d < 0 || deg.startsWith('-') ? -1 : 1
  let v = Math.abs(d) + (min ? Number(min) / 60 : 0) + (sec ? Number(sec) / 3600 : 0)
  const h = hemi?.toUpperCase()
  if (h === 'S' || h === 'W') v = -v
  else v = sign * v
  return v
}

const validLat = (v: number) => Number.isFinite(v) && Math.abs(v) <= 90
const validLon = (v: number) => Number.isFinite(v) && Math.abs(v) <= 180

export function parseCoordinates(input: string): ParsedCoords | null {
  const m = COORD_RE.exec(input)
  if (!m) return null
  const [, d1, m1, s1, h1, d2, m2, s2, h2] = m
  const a = toDecimal(d1, m1, s1, h1)
  const b = toDecimal(d2, m2, s2, h2)
  const H1 = h1?.toUpperCase()
  const H2 = h2?.toUpperCase()

  // Hemisphere letters decide the order when present.
  const firstIsLon = H1 === 'E' || H1 === 'W' || H2 === 'N' || H2 === 'S'
  if (firstIsLon) return validLat(b) && validLon(a) ? { lat: b, lon: a, swapped: false } : null
  if (H1 || H2) return validLat(a) && validLon(b) ? { lat: a, lon: b, swapped: false } : null

  if (validLat(a) && validLon(b)) return { lat: a, lon: b, swapped: false }
  if (validLat(b) && validLon(a)) return { lat: b, lon: a, swapped: true }
  return null
}

/** Great-circle distance in km (haversine). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "30.20800° N, 71.50900° E" */
export function formatLatLon(lat: number, lon: number, digits = 5): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${Math.abs(lon).toFixed(digits)}° ${ew}`
}

/** Plain "lat, lon" for copying into other tools. */
export function plainLatLon(lat: number, lon: number, digits = 5): string {
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 100) return `${km.toFixed(1)} km`
  return `${Math.round(km).toLocaleString()} km`
}
