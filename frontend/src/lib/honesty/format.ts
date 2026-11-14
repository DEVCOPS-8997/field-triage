// Honesty helpers: a missing value is "no observation", never zero.

export const NO_OBSERVATION = 'No observation'

/** The verbatim disclaimer sentence (UI-SPEC Copywriting Contract). */
export const DISCLAIMER_TEXT = 'Supports farmers and advisers; it does not replace them.'

export const ILLUSTRATIVE_TOOLTIP =
  'Scoring thresholds are not yet validated against local references (validated: false).'

/** Returns the number only if it is a real finite number; never coerces. */
export function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** True for null, undefined and non-finite numbers (NaN, Infinity). */
export function isMissing(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))
}

export interface FormatOptions {
  /** Decimal places (default: 1). */
  digits?: number
  /** Text to show for a missing value (default: "No observation"). */
  missing?: string
}

/**
 * Formats a measured value with its unit. null, undefined and NaN return
 * "No observation" (or `missing`), never "0".
 */
export function formatValue(
  value: number | null | undefined,
  unit?: string,
  { digits = 1, missing = NO_OBSERVATION }: FormatOptions = {},
): string {
  const n = toNumberOrNull(value)
  if (n === null) return missing
  const text = n.toFixed(digits)
  return unit ? `${text} ${unit}` : text
}

/** Formats an ISO date (YYYY-MM-DD...) for display; missing returns `missing`. */
export function formatDate(value: unknown, missing = NO_OBSERVATION): string {
  if (typeof value !== 'string' || value.trim() === '') return missing
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
