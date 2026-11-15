// Farm unit conversions (pure functions, no React). Every water amount ends up as a
// depth in millimetres over the field, every income as USD per hectare per year,
// because that is what the backend FarmConstraints expect.

// ---------------------------------------------------------------- area constants
export const M2_PER_HECTARE = 10_000
export const M2_PER_ACRE = 4046.86
export const M2_PER_KANAL = 505.857 // 1 acre = 8 kanal (Punjab revenue units)
export const ACRES_PER_HECTARE = M2_PER_HECTARE / M2_PER_ACRE // 2.4711

// --------------------------------------------------------------- volume constants
export const MM_PER_INCH = 25.4
export const M3_PER_ACRE_INCH = M2_PER_ACRE * 0.0254 // 102.79 m³
export const M3_PER_ACRE_FOOT = M2_PER_ACRE * 0.3048 // 1233.48 m³
export const M3_PER_CUSEC_HOUR = 0.0283168 * 3600 // 1 cubic foot per second for one hour = 101.94 m³
export const M3_PER_LITRE_PER_SECOND_HOUR = 3.6 // 1 L/s for one hour = 3.6 m³

// ------------------------------------------------------------------- defaults
/** Typical farm tubewell, about 1 cusec. Farmers should replace it with their own. */
export const DEFAULT_TUBEWELL_LPS = 28
/** Typical outlet (mogha) discharge for one warabandi turn. */
export const DEFAULT_CANAL_CUSECS = 1
export const DEFAULT_HOURS_PER_TURN = 3
/** PKR per USD. Changes daily, so the UI keeps it editable. */
export const DEFAULT_PKR_PER_USD = 280

export type AreaUnit = 'acre' | 'hectare' | 'kanal'
export type WaterUnit = 'mm' | 'inch' | 'acre_inch' | 'acre_foot' | 'm3' | 'tubewell_hours' | 'canal_turns'
export type Currency = 'PKR' | 'USD'
export type PerArea = 'acre' | 'hectare'

const M2_PER_AREA_UNIT: Record<AreaUnit, number> = {
  acre: M2_PER_ACRE,
  hectare: M2_PER_HECTARE,
  kanal: M2_PER_KANAL,
}

const ok = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

export function areaToM2(value: number, unit: AreaUnit): number {
  return value * M2_PER_AREA_UNIT[unit]
}

export function areaToHa(value: number, unit: AreaUnit): number {
  return areaToM2(value, unit) / M2_PER_HECTARE
}

export function haToAcres(ha: number): number {
  return ha * ACRES_PER_HECTARE
}

/** True when the unit is a volume, so the field area is needed to turn it into a depth. */
export function needsArea(unit: WaterUnit): boolean {
  return unit !== 'mm' && unit !== 'inch'
}

export interface WaterExtras {
  /** Tubewell flow in litres per second (tubewell_hours only). */
  tubewellLps?: number | null
  /** Hours per canal turn (canal_turns only). */
  hoursPerTurn?: number | null
  /** Outlet discharge in cusecs (canal_turns only). */
  canalCusecs?: number | null
}

/** Water amount as a volume in cubic metres; null for depth units or missing inputs. */
export function waterVolumeM3(amount: number, unit: WaterUnit, extras: WaterExtras = {}): number | null {
  if (!ok(amount) || amount < 0) return null
  switch (unit) {
    case 'acre_inch':
      return amount * M3_PER_ACRE_INCH
    case 'acre_foot':
      return amount * M3_PER_ACRE_FOOT
    case 'm3':
      return amount
    case 'tubewell_hours':
      return ok(extras.tubewellLps) && extras.tubewellLps > 0
        ? amount * extras.tubewellLps * M3_PER_LITRE_PER_SECOND_HOUR
        : null
    case 'canal_turns':
      return ok(extras.hoursPerTurn) && ok(extras.canalCusecs) && extras.hoursPerTurn > 0 && extras.canalCusecs > 0
        ? amount * extras.hoursPerTurn * extras.canalCusecs * M3_PER_CUSEC_HOUR
        : null
    default:
      return null
  }
}

/**
 * Convert a water amount to millimetres of depth over the field.
 * Returns null when the input is missing or a volume unit has no usable field area.
 */
export function waterToMm(
  amount: number | null | undefined,
  unit: WaterUnit,
  areaM2: number | null | undefined,
  extras: WaterExtras = {},
): number | null {
  if (!ok(amount) || amount < 0) return null
  if (unit === 'mm') return amount
  if (unit === 'inch') return amount * MM_PER_INCH
  const m3 = waterVolumeM3(amount, unit, extras)
  if (m3 === null || !ok(areaM2) || areaM2 <= 0) return null
  return (m3 / areaM2) * 1000
}

/** Income amount to USD per hectare. Null when missing or the exchange rate is unusable. */
export function incomeToUsdPerHa(
  amount: number | null | undefined,
  currency: Currency,
  per: PerArea,
  pkrPerUsd: number | null | undefined,
): number | null {
  if (!ok(amount) || amount < 0) return null
  let usd = amount
  if (currency === 'PKR') {
    if (!ok(pkrPerUsd) || pkrPerUsd <= 0) return null
    usd = amount / pkrPerUsd
  }
  return per === 'acre' ? usd * ACRES_PER_HECTARE : usd
}

/** Rain per year after a scenario multiplier (for "about 150 mm a year instead of 190"). */
export function scaledRainMm(annualMm: number | null | undefined, multiplier: number): number | null {
  return ok(annualMm) ? annualMm * multiplier : null
}

/** Parse a user-typed number; empty or invalid text becomes null (never 0). */
export function parseAmount(text: string): number | null {
  const t = text.replace(/,/g, '').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function fmtNumber(v: number, maxDigits = 0): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: maxDigits })
}

export const AREA_UNIT_LABEL: Record<AreaUnit, string> = {
  acre: 'acres',
  hectare: 'hectares',
  kanal: 'kanal',
}

export const WATER_UNIT_LABEL: Record<WaterUnit, string> = {
  mm: 'millimetres (mm)',
  inch: 'inches',
  acre_inch: 'acre-inches',
  acre_foot: 'acre-feet',
  m3: 'cubic metres (m³)',
  tubewell_hours: 'tubewell hours',
  canal_turns: 'canal turns (warabandi)',
}
