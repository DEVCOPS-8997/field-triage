// Client-side, illustrative "Right now" status (plan section 7, Tier 3).
// All thresholds live in this ONE object. They are NOT validated against
// local references; replace with parameters.json values when M2/M3 expose them.

import type { FieldProfile } from '../../types/api'
import { formatValue, toNumberOrNull } from './format'

export const NOW_THRESHOLDS = {
  /** 30-day rain below this counts as dry (mm). */
  rain_30d_dry_mm: 10,
  /** Root-zone soil moisture below this counts as dry (m3/m3). */
  rootzone_dry_m3m3: 0.18,
  /** 7-day mean daily maximum temperature at or above this adds a heat watch (C). */
  max_temp_7d_hot_c: 38,
  /** These thresholds are illustrative. */
  validated: false,
} as const

export type NowStatus = 'FAVORABLE' | 'WATCH' | 'STRESSED'

export interface NowValues {
  rain_7d_mm: number | null
  rain_14d_mm: number | null
  rain_30d_mm: number | null
  mean_temp_7d_c: number | null
  max_temp_7d_c: number | null
  rootzone_latest_m3m3: number | null
  ndvi_latest: number | null
  latest_dates: Record<string, string>
}

export interface NowAssessment {
  /** null when there are not enough observations to set a status. */
  status: NowStatus | null
  reasons: string[]
}

/** Reads the loosely typed `now{}` block without ever turning a gap into 0. */
export function readNow(now: FieldProfile['now'] | null | undefined): NowValues {
  const src = now ?? {}
  const datesRaw = src.latest_dates
  const latest_dates: Record<string, string> = {}
  if (datesRaw && typeof datesRaw === 'object') {
    for (const [k, v] of Object.entries(datesRaw)) {
      if (typeof v === 'string' && v.trim() !== '') latest_dates[k] = v
    }
  }
  return {
    rain_7d_mm: toNumberOrNull(src.rain_7d_mm),
    rain_14d_mm: toNumberOrNull(src.rain_14d_mm),
    rain_30d_mm: toNumberOrNull(src.rain_30d_mm),
    mean_temp_7d_c: toNumberOrNull(src.mean_temp_7d_c),
    max_temp_7d_c: toNumberOrNull(src.max_temp_7d_c),
    rootzone_latest_m3m3: toNumberOrNull(src.rootzone_latest_m3m3),
    ndvi_latest: toNumberOrNull(src.ndvi_latest),
    latest_dates,
  }
}

/**
 * STRESSED if 30-day rain AND root-zone moisture are both below their dry
 * thresholds; WATCH if either is (or the week was very hot); else FAVORABLE.
 */
export interface NowThresholds {
  rain_30d_dry_mm: number
  rootzone_dry_m3m3: number
  max_temp_7d_hot_c: number
  validated: boolean
}

export function assessNow(v: NowValues, t: NowThresholds = NOW_THRESHOLDS): NowAssessment {
  const reasons: string[] = []
  const rain = v.rain_30d_mm
  const soil = v.rootzone_latest_m3m3
  const heat = v.max_temp_7d_c

  if (rain === null && soil === null) {
    return {
      status: null,
      reasons: ['No observation for 30-day rain or root-zone moisture, so no status is shown.'],
    }
  }

  const rainDry = rain !== null && rain < t.rain_30d_dry_mm
  const soilDry = soil !== null && soil < t.rootzone_dry_m3m3
  const hot = heat !== null && heat >= t.max_temp_7d_hot_c

  if (rain === null) {
    reasons.push('30-day rain has no observation, so the status uses soil moisture only.')
  } else if (rainDry) {
    reasons.push(
      `Rain over the last 30 days was ${formatValue(rain, 'mm')}, below the ${t.rain_30d_dry_mm} mm dry threshold.`,
    )
  } else {
    reasons.push(
      `Rain over the last 30 days was ${formatValue(rain, 'mm')}, at or above the ${t.rain_30d_dry_mm} mm dry threshold.`,
    )
  }

  if (soil === null) {
    reasons.push('Root-zone moisture has no observation, so the status uses rainfall only.')
  } else if (soilDry) {
    reasons.push(
      `Latest root-zone moisture is ${formatValue(soil, 'm³/m³', { digits: 3 })}, below the ${t.rootzone_dry_m3m3} m³/m³ dry threshold.`,
    )
  } else {
    reasons.push(
      `Latest root-zone moisture is ${formatValue(soil, 'm³/m³', { digits: 3 })}, at or above the ${t.rootzone_dry_m3m3} m³/m³ dry threshold.`,
    )
  }

  if (hot) {
    reasons.push(
      `Mean daily maximum over the last 7 days was ${formatValue(heat, '°C')}, at or above ${t.max_temp_7d_hot_c} °C.`,
    )
  }

  let status: NowStatus
  if (rainDry && soilDry) status = 'STRESSED'
  else if (rainDry || soilDry || hot) status = 'WATCH'
  else status = 'FAVORABLE'

  return { status, reasons }
}
