/**
 * Number and date helpers.
 *
 * Data numbers always use Western digits (0-9) in both languages: that is what Pakistani
 * agriculture sources, seed bags and extension material use, and it keeps numbers identical to
 * the English screens. Wrap a formatted number in <Ltr> when it sits inside an Urdu sentence
 * together with a unit or a sign (e.g. "-12 mm").
 */
import type { Lang } from './types'

const nfCache = new Map<string, Intl.NumberFormat>()

/** Locale used for numbers: Western digits in both languages. */
const numberLocale = (lang: Lang) => (lang === 'ur' ? 'en-PK' : 'en-US')

export function formatNumber(value: number | null | undefined, opts: Intl.NumberFormatOptions = {}, lang: Lang = 'en'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  const id = `${lang}|${JSON.stringify(opts)}`
  let nf = nfCache.get(id)
  if (!nf) {
    nf = new Intl.NumberFormat(numberLocale(lang), { numberingSystem: 'latn', ...opts })
    nfCache.set(id, nf)
  }
  return nf.format(value)
}

/** Percent from a 0-1 share: formatPercent(0.42) -> "42%". */
export function formatPercent(share: number | null | undefined, digits = 0, lang: Lang = 'en'): string {
  return formatNumber(share, { style: 'percent', maximumFractionDigits: digits, minimumFractionDigits: digits }, lang)
}

/**
 * Date as "3 Mar 2024" (English) or "3 مارچ 2024" (Urdu month name, Western digits).
 * Accepts ISO strings ("2024-03-03" is read as UTC) or Date objects. Returns `missing` when empty.
 */
export function formatDate(value: string | Date | null | undefined, lang: Lang = 'en', missing = ''): string {
  if (value === null || value === undefined || value === '') return missing
  const d = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : missing
  const locale = lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB'
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
