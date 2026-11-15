// Field-level erosion risk for one rotation (challenge point 16).
// Pure, deterministic, no I/O. Inputs: the rotation's "farm year" (bare months, heavy-rain risk),
// the site slope from the Copernicus DEM, and monthly rain as a fallback for heavy-rain months.
//
// Logic (screening level, not a soil-loss model):
//   exposure   = months that are bare (no crop, no cover) AND heavy rain is likely
//   slope band = flat < 2°, gentle 2-5°, moderate 5-10°, steep >= 10°
//   high   : 2+ exposed months on a gentle-or-steeper slope, 1+ exposed month on moderate/steep,
//            or any bare month on a steep slope
//   medium : any exposed month, a moderate/steep slope, or 4+ bare months on a gentle slope
//   low    : otherwise
// Missing inputs fall back conservatively (unknown slope is treated as "gentle").

import type { CompareResponse, FieldProfile, FarmMonth, RotationScore } from '../types/api'

export type ErosionLevel = 'low' | 'medium' | 'high'

export interface ErosionRisk {
  level: ErosionLevel
  /** One plain sentence: why this level. */
  reason: string
  /** "High: bare soil in July–August when heavy rain is likely; slope 3°" */
  summary: string
  bareMonths: number[] // 1..12
  heavyRainMonths: number[]
  exposedMonths: number[] // bare AND heavy rain
  slopeDeg: number | null
  /** Which inputs were real vs. assumed, for honest copy. */
  basis: { farmYear: boolean; heavyRainFrom: 'farm_year' | 'monthly_rain' | 'none'; slope: boolean }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Share of past years with a >= 25 mm day above which a month counts as "heavy rain likely". */
export const HEAVY_RAIN_SHARE = 0.3
/** Fallback when only monthly totals exist: a mean month this wet usually holds downpours. */
export const HEAVY_RAIN_MONTHLY_MM = 80

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** [7, 8] -> "July–August"; [12, 1, 2] -> "December–February"; [3, 7] -> "March and July". */
export function monthSpanText(months: number[]): string {
  if (months.length === 0) return ''
  const set = new Set(months)
  // Find runs on a circular year, starting after a gap so Dec–Jan stays together.
  let start = 1
  if (set.size < 12) while (set.has(start === 1 ? 12 : start - 1) || !set.has(start)) start = (start % 12) + 1
  const runs: number[][] = []
  let cur: number[] = []
  for (let i = 0; i < 12; i++) {
    const m = ((start - 1 + i) % 12) + 1
    if (set.has(m)) cur.push(m)
    else if (cur.length) {
      runs.push(cur)
      cur = []
    }
  }
  if (cur.length) runs.push(cur)
  const parts = runs.map((r) => (r.length === 1 ? MONTHS[r[0] - 1] : `${MONTHS[r[0] - 1]}–${MONTHS[r[r.length - 1] - 1]}`))
  return parts.length <= 1 ? parts[0] ?? '' : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function slopeBand(s: number | null): 0 | 1 | 2 | 3 {
  if (s === null) return 1
  if (s < 2) return 0
  if (s < 5) return 1
  if (s < 10) return 2
  return 3
}

function monthlyRainMeans(profile: FieldProfile | undefined): (number | null)[] {
  const sums = Array(12).fill(0)
  const counts = Array(12).fill(0)
  for (const r of profile?.monthly ?? []) {
    if (isNum(r.rain_mm) && r.month >= 1 && r.month <= 12) {
      sums[r.month - 1] += r.rain_mm
      counts[r.month - 1] += 1
    }
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i] : null))
}

function livingRootShare(r: RotationScore): number | null {
  const e = r.evidence?.find((x) => x.variable === 'living_root_share')
  const v = typeof e?.value === 'string' ? Number(e.value) : e?.value
  if (!isNum(v)) return null
  return v > 1 ? v / 100 : v // backend may send % or 0..1
}

/**
 * Erosion risk for `rotationId` (default: the farmer's current rotation, else the top-ranked one).
 * Returns null only when there is no rotation at all.
 */
export function erosionRisk(
  data: CompareResponse & { profile?: FieldProfile },
  rotationId?: string | null,
): ErosionRisk | null {
  const rotations = data.rotations ?? []
  const rot =
    rotations.find((r) => r.rotation_id === rotationId) ??
    rotations.find((r) => r.is_existing) ??
    [...rotations].sort((a, b) => a.rank - b.rank)[0]
  if (!rot) return null

  const profile = data.profile
  const slopeRaw = profile?.terrain?.slope_deg
  const slopeDeg = isNum(slopeRaw) ? slopeRaw : null
  const band = slopeBand(slopeDeg)

  const fy: FarmMonth[] = (rot.farm_year ?? []).filter((m) => m && m.month >= 1 && m.month <= 12)
  const hasFarmYear = fy.length > 0
  const bareMonths = fy.filter((m) => m.bare && !m.cover_crop).map((m) => m.month)

  // Heavy-rain months: farm_year risk first, then long-term monthly rain.
  let heavyRainFrom: ErosionRisk['basis']['heavyRainFrom'] = 'none'
  let heavyRainMonths: number[] = []
  if (fy.some((m) => isNum(m.heavy_rain_risk))) {
    heavyRainFrom = 'farm_year'
    heavyRainMonths = fy.filter((m) => isNum(m.heavy_rain_risk) && m.heavy_rain_risk >= HEAVY_RAIN_SHARE).map((m) => m.month)
  } else {
    const means = monthlyRainMeans(profile)
    if (means.some((v) => v !== null)) {
      heavyRainFrom = 'monthly_rain'
      heavyRainMonths = means.flatMap((v, i) => (v !== null && v >= HEAVY_RAIN_MONTHLY_MM ? [i + 1] : []))
    }
  }
  const heavySet = new Set(heavyRainMonths)
  const alertMonths = fy.filter((m) => m.erosion_alert).map((m) => m.month)
  const exposedMonths = [...new Set([...bareMonths.filter((m) => heavySet.has(m)), ...alertMonths])].sort((a, b) => a - b)

  // Without a farm year, estimate the number of bare months from the living-roots share.
  let bareCount = bareMonths.length
  if (!hasFarmYear) {
    const share = livingRootShare(rot)
    bareCount = share === null ? 0 : Math.round(12 * (1 - share))
  }
  const exposed = exposedMonths.length

  let level: ErosionLevel
  if ((exposed >= 2 && band >= 1) || (exposed >= 1 && band >= 2) || (band === 3 && bareCount >= 1)) level = 'high'
  else if (exposed >= 1 || band >= 2 || (bareCount >= 4 && band >= 1)) level = 'medium'
  else level = 'low'

  const slopeText = slopeDeg === null ? 'slope not known' : `slope ${slopeDeg < 1 ? slopeDeg.toFixed(1) : Math.round(slopeDeg)}°`
  let why: string
  if (exposed > 0) why = `bare soil in ${monthSpanText(exposedMonths)} when heavy rain is likely`
  else if (hasFarmYear && bareMonths.length > 0)
    why = `bare soil in ${monthSpanText(bareMonths)}, but heavy rain is not usual then`
  else if (hasFarmYear) why = 'the soil is covered by a crop all year'
  else if (bareCount > 0) why = `about ${bareCount} month${bareCount === 1 ? '' : 's'} a year without a crop`
  else why = 'no bare-soil information for this rotation'
  const reason = `${why[0].toUpperCase()}${why.slice(1)}; ${slopeText}.`
  const levelText = level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low'

  return {
    level,
    reason,
    summary: `${levelText}: ${why}; ${slopeText}`,
    bareMonths,
    heavyRainMonths,
    exposedMonths,
    slopeDeg,
    basis: { farmYear: hasFarmYear, heavyRainFrom, slope: slopeDeg !== null },
  }
}

/** Map styling per level. Pattern (dash) and label carry the level too, never colour alone. */
export const EROSION_STYLE: Record<ErosionLevel, { label: string; color: string; fill: string; dashArray?: string; weight: number }> = {
  low: { label: 'Low', color: '#4ade80', fill: '#4ade80', weight: 3 },
  medium: { label: 'Medium', color: '#fbbf24', fill: '#fbbf24', dashArray: '10 6', weight: 3 },
  high: { label: 'High', color: '#fb7185', fill: '#fb7185', dashArray: '3 5', weight: 4 },
}
