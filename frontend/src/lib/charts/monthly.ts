import type { MonthRecord } from '../../types/api'

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export const BARE_NDVI_THRESHOLD = 0.2

export interface MonthlyMean {
  month: number // 1..12
  label: string
  rain_mm: number | null
  ndvi: number | null
  moisture: number | null
}

function mean(values: (number | null | undefined)[]): number | null {
  let sum = 0
  let n = 0
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += v
      n += 1
    }
  }
  return n === 0 ? null : sum / n
}

/** Long-term monthly means (Jan..Dec). Nulls are ignored; a month with no observations stays null (a gap, never 0). */
export function aggregateMonthly(monthly: MonthRecord[]): MonthlyMean[] {
  return MONTH_LABELS.map((label, i) => {
    const recs = monthly.filter((r) => r.month === i + 1)
    return {
      month: i + 1,
      label,
      rain_mm: mean(recs.map((r) => r.rain_mm)),
      ndvi: mean(recs.map((r) => r.ndvi_mean)),
      moisture: mean(recs.map((r) => r.smap_rootzone_m3m3)),
    }
  })
}

/** Contiguous runs of months whose mean NDVI is below the bare threshold, as [startMonth, endMonth] (1-based, inclusive). */
export function bareRuns(data: MonthlyMean[], threshold = BARE_NDVI_THRESHOLD): [number, number][] {
  const runs: [number, number][] = []
  let start: number | null = null
  for (const d of data) {
    const bare = d.ndvi !== null && d.ndvi < threshold
    if (bare && start === null) start = d.month
    if (!bare && start !== null) {
      runs.push([start, d.month - 1])
      start = null
    }
  }
  if (start !== null) runs.push([start, 12])
  return runs
}

export function monthRangeLabel([a, b]: [number, number]): string {
  return a === b ? MONTH_LABELS[a - 1] : `${MONTH_LABELS[a - 1]}–${MONTH_LABELS[b - 1]}`
}

export function missingMonths(data: MonthlyMean[], key: 'rain_mm' | 'ndvi' | 'moisture'): string[] {
  return data.filter((d) => d[key] === null).map((d) => d.label)
}

export function extremes(
  data: MonthlyMean[],
  key: 'rain_mm' | 'ndvi' | 'moisture',
): { max: MonthlyMean; min: MonthlyMean } | null {
  const present = data.filter((d) => d[key] !== null)
  if (present.length === 0) return null
  let max = present[0]
  let min = present[0]
  for (const d of present) {
    if ((d[key] as number) > (max[key] as number)) max = d
    if ((d[key] as number) < (min[key] as number)) min = d
  }
  return { max, min }
}
