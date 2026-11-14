/**
 * Geodesic field measurements, identical to backend `app/services/geo.py` so the numbers shown
 * while drawing are the numbers that get saved. Points are [lon, lat].
 * Polygon area: spherical-excess ring formula (Chamberlain & Duquette 2007, NASA JPL), as used by
 * Turf.js and Leaflet.Draw. Lengths: haversine on the IUGG mean Earth radius.
 */
export type LonLat = [number, number]

export const EARTH_RADIUS_M = 6_371_008.8
const RAD = Math.PI / 180

export function haversineM(a: LonLat, b: LonLat): number {
  const [lon1, lat1, lon2, lat2] = [a[0] * RAD, a[1] * RAD, b[0] * RAD, b[1] * RAD]
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function ringAreaM2(ring: LonLat[]): number {
  const n = ring.length
  if (n < 3) return 0
  let total = 0
  for (let i = 0; i < n; i++) {
    const [lo1, la1] = ring[(i - 1 + n) % n]
    const [lo2, la2] = ring[i]
    total += (lo2 - lo1) * RAD * (2 + Math.sin(la1 * RAD) + Math.sin(la2 * RAD))
  }
  return Math.abs((total * EARTH_RADIUS_M ** 2) / 2)
}

export function sidesM(ring: LonLat[]): number[] {
  return ring.length < 2 ? [] : ring.map((p, i) => haversineM(p, ring[(i + 1) % ring.length]))
}

function cross(a: LonLat, b: LonLat, c: LonLat) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

export function selfIntersects(ring: LonLat[]): boolean {
  const n = ring.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue
      const [a, b, c, d] = [ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]]
      if (cross(c, d, a) * cross(c, d, b) < 0 && cross(a, b, c) * cross(a, b, d) < 0) return true
    }
  }
  return false
}

/** Destination point from `start` after `dist` metres on `bearing` degrees (for drawing circles). */
export function destination(start: LonLat, dist: number, bearing: number): LonLat {
  const d = dist / EARTH_RADIUS_M
  const br = bearing * RAD
  const lat1 = start[1] * RAD
  const lon1 = start[0] * RAD
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br))
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [lon2 / RAD, lat2 / RAD]
}

export function circleRing(center: LonLat, radius: number, steps = 64): LonLat[] {
  return Array.from({ length: steps }, (_, i) => destination(center, radius, (i * 360) / steps))
}

export const M2_PER_ACRE = 4046.8564224

export function fmtArea(m2: number): { m2: string; ha: string; acres: string } {
  return {
    m2: Math.round(m2).toLocaleString(),
    ha: (m2 / 10_000).toLocaleString(undefined, { maximumFractionDigits: m2 < 10_000 ? 3 : 2 }),
    acres: (m2 / M2_PER_ACRE).toLocaleString(undefined, { maximumFractionDigits: 2 }),
  }
}

export function fmtLen(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km` : `${m.toFixed(m < 10 ? 1 : 0)} m`
}
