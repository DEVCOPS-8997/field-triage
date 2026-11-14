import { useEffect, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { EvidenceItem, MonthRecord, RotationScore } from '../../types/api'
import { MONTH_LABELS } from '../../lib/charts/monthly'
import { SCORE_COMPONENTS } from '../../lib/charts/tokens'
import { cx, fg, surface, tabular, type } from '../../lib/ui4/cls'

/** Value that only updates after `ms` without changes (slider re-scoring). */
export function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}

export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function fmt(v: unknown, digits = 0, unit = ''): string {
  const n = num(v)
  if (n === null) return 'n/a'
  const s = n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return unit ? `${s} ${unit}` : s
}

/** Score components every rotation actually has (income drops out when FAOSTAT data is missing). */
export function scoredComponents(rotations: RotationScore[]) {
  return SCORE_COMPONENTS.filter((c) => rotations.length > 0 && rotations.every((r) => typeof r.scores?.[c.key] === 'number'))
}

export function evidenceValue(r: RotationScore, variable: string): number | null {
  const e: EvidenceItem | undefined = r.evidence?.find((x) => x.variable === variable)
  return num(typeof e?.value === 'string' ? Number(e.value) : e?.value)
}

export const STRATEGY_LABEL: Record<string, string> = {
  conventional: 'Conventional',
  water_saving: 'Water saving',
  soil_building: 'Soil building',
  income: 'Income',
  resilience: 'Resilience',
  diversified: 'Diversified',
  existing: 'Conventional',
}
export const strategyLabel = (s: string) => STRATEGY_LABEL[s] ?? s.replace(/_/g, ' ')

/** UNEP aridity classes for P/ETo. */
export function aridityClass(ai: number | null): string {
  if (ai === null) return 'unknown'
  if (ai < 0.05) return 'hyper-arid'
  if (ai < 0.2) return 'arid'
  if (ai < 0.5) return 'semi-arid'
  if (ai < 0.65) return 'dry sub-humid'
  return 'humid'
}

export interface MonthlyClimate {
  month: number
  label: string
  rain: number | null
  eto: number | null
  tmax: number | null
  tmin: number | null
  tmean: number | null
  range: [number, number] | null
}

function mean(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Long-term monthly means over complete years only (the current partial month would bias them low). */
export function monthlyClimate(monthly: MonthRecord[]): MonthlyClimate[] {
  const counts = new Map<number, number>()
  for (const r of monthly) counts.set(r.year, (counts.get(r.year) ?? 0) + 1)
  const full = monthly.filter((r) => counts.get(r.year) === 12)
  const recs = full.length ? full : monthly
  return MONTH_LABELS.map((label, i) => {
    const m = recs.filter((r) => r.month === i + 1)
    const tmax = mean(m.map((r) => r.tmax_mean_c))
    const tmin = mean(m.map((r) => r.tmin_mean_c))
    return {
      month: i + 1,
      label,
      rain: mean(m.map((r) => r.rain_mm)),
      eto: mean(m.map((r) => r.eto_mm)),
      tmax,
      tmin,
      tmean: mean(m.map((r) => r.tmean_c)),
      range: tmax !== null && tmin !== null ? [tmin, tmax] : null,
    }
  })
}

/** Section wrapper with an anchor id for the in-page nav. */
export function ResultSection({
  id,
  title,
  subtitle,
  actions,
  children,
}: {
  id: string
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`${id}-title`} className={cx('m-0', type.heading, fg.fg)}>
            {title}
          </h2>
          {subtitle && <p className={cx('m-0', type.label, fg.fg3)}>{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

/** KPI tile: icon, label, headline number, unit and one line of interpretation. */
export function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  caption,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: string
  unit?: string
  caption?: ReactNode
  tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'info'
}) {
  const chip = {
    neutral: 'bg-[rgba(255,255,255,0.08)] text-[color:var(--color-fg-2,#b4cfc0)]',
    accent: 'bg-[rgba(74,222,128,0.16)] text-[color:var(--color-accent,#4ade80)]',
    warn: 'bg-[rgba(251,191,36,0.16)] text-[color:var(--color-demo,#fbbf24)]',
    danger: 'bg-[rgba(253,164,175,0.16)] text-[color:var(--color-danger,#fda4af)]',
    info: 'bg-[rgba(56,189,248,0.16)] text-[#7dd3fc]',
  }[tone]
  return (
    <div
      className={cx(
        surface.glass,
        'flex min-w-0 flex-col gap-2 p-4 transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5',
      )}
    >
      <span className={cx('flex items-center gap-2.5 font-semibold', type.label, fg.fg2)}>
        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', chip)}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0 leading-tight">{label}</span>
      </span>
      <span className={cx('flex items-baseline gap-1', fg.fg)}>
        <span className={cx('text-[28px] leading-[1.15] font-semibold', tabular)}>{value}</span>
        {unit && <span className={cx(type.label, fg.fg3)}>{unit}</span>}
      </span>
      {caption && <span className={cx('text-[13px] leading-snug font-normal', fg.fg3)}>{caption}</span>}
    </div>
  )
}

/** Ring gauge for a 0-100 score (headline only; the exact number is printed in the middle). */
export function ScoreRing({
  value,
  size = 148,
  stroke = 12,
  color = '#4ade80',
  caption,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  caption?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          style={{ filter: `drop-shadow(0 0 8px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cx('text-[40px] leading-none font-semibold', tabular, fg.fg)}>{v.toFixed(0)}</span>
        {caption && <span className={cx(type.label, fg.fg3)}>{caption}</span>}
      </div>
    </div>
  )
}

export function scoreWord(v: number): string {
  if (v >= 75) return 'Strong'
  if (v >= 60) return 'Good'
  if (v >= 45) return 'Fair'
  return 'Weak'
}

/** 0-100 bar with the historical range drawn as a whisker. */
export function ScoreBar({
  value,
  low,
  high,
  color = 'var(--color-accent,#4ade80)',
  label,
}: {
  value: number
  low?: number
  high?: number
  color?: string
  label: string
}) {
  const clamp = (x: number) => Math.max(0, Math.min(100, x))
  return (
    <div
      role="img"
      aria-label={`${label}: ${value.toFixed(0)} of 100${low !== undefined && high !== undefined ? `, historical range ${low.toFixed(0)} to ${high.toFixed(0)}` : ''}`}
      className="relative h-3 w-full rounded-full bg-[rgba(255,255,255,0.08)]"
    >
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clamp(value)}%`, background: color }} />
      {low !== undefined && high !== undefined && (
        <div
          className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-[color:var(--color-fg,#ecfdf3)] opacity-80"
          style={{ left: `${clamp(low)}%`, width: `${Math.max(0.5, clamp(high) - clamp(low))}%` }}
        >
          <span className="absolute -left-px top-1/2 h-3 w-[2px] -translate-y-1/2 bg-[color:var(--color-fg,#ecfdf3)]" />
          <span className="absolute -right-px top-1/2 h-3 w-[2px] -translate-y-1/2 bg-[color:var(--color-fg,#ecfdf3)]" />
        </div>
      )}
    </div>
  )
}
