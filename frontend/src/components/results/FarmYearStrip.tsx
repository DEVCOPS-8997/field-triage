import type { ReactNode } from 'react'
import {
  Flower2,
  OctagonAlert,
  Sparkles,
  Sprout,
  TriangleAlert,
  Waves,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
import type { FarmMonth } from '../../types/api'
import { MONTH_LABELS } from '../../lib/charts/monthly'
import { CHART_COLORS } from '../../lib/charts/tokens'
import { cx, fg, tabular } from '../../lib/ui4/cls'
import Term from '../ui/Term'
import type { GlossaryId } from '../../lib/glossary'

const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ------------------------------------------------------------------ risk levels
type RiskLevel = 'low' | 'some' | 'high'

/** Share of past years → 3 plain levels: low < 0.2, some 0.2 to 0.5, high > 0.5. */
function riskLevel(v: number | null | undefined): RiskLevel | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  if (v > 0.5) return 'high'
  if (v >= 0.2) return 'some'
  return 'low'
}

const RISK_STYLE: Record<RiskLevel, { label: string; icon: LucideIcon | null; cls: string }> = {
  low: { label: 'Low', icon: null, cls: 'text-[color:var(--color-fg-3,#9bbba8)]' },
  some: {
    label: 'Some',
    icon: TriangleAlert,
    cls: 'bg-[rgba(251,191,36,0.16)] text-[color:var(--color-demo,#fbbf24)]',
  },
  high: {
    label: 'High',
    icon: OctagonAlert,
    cls: 'bg-[rgba(253,164,175,0.2)] text-[color:var(--color-danger,#fda4af)]',
  },
}

const STAGE: Record<string, { icon: LucideIcon; label: string } | undefined> = {
  sowing: { icon: Sprout, label: 'sowing' },
  flowering: { icon: Flower2, label: 'flowering' },
  harvest: { icon: Wheat, label: 'harvest' },
}

function pct(v: number): string {
  return `${Math.round(v * 100)}% of past years`
}

// --------------------------------------------------------------------- cells
const cellBase = 'h-12 border-l border-[color:var(--color-glass-border,rgba(190,242,220,0.12))] p-0.5 text-center align-middle'

function RiskCell({ v, month, what, extra }: { v: number | null | undefined; month: number; what: string; extra?: ReactNode }) {
  const level = riskLevel(v)
  if (level === null) {
    return (
      <td className={cx(cellBase, fg.fg3)}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{MONTH_FULL[month - 1]}: {what} not relevant this month</span>
      </td>
    )
  }
  const s = RISK_STYLE[level]
  const Icon = s.icon
  return (
    <td className={cellBase} title={`${what}: ${s.label.toLowerCase()} (${pct(v as number)})`}>
      <span className={cx('flex h-full flex-col items-center justify-center gap-0.5 rounded-md text-[12px] font-semibold', s.cls)}>
        <span className="inline-flex items-center gap-0.5">
          {Icon && <Icon size={12} aria-hidden="true" />}
          {s.label}
        </span>
        {extra}
      </span>
      <span className="sr-only">
        {' '}
        ({pct(v as number)})
      </span>
    </td>
  )
}

interface CropBand {
  start: number // index 0..11
  end: number
  crops: string[]
  cover: boolean
}

/** Consecutive months with the same crop(s) become one band (split at the year edge). */
function cropBands(year: FarmMonth[]): (CropBand | { start: number; end: number; bare: true })[] {
  const out: (CropBand | { start: number; end: number; bare: true })[] = []
  year.forEach((m, i) => {
    const key = m.crops.length === 0 ? '' : `${m.crops.join('+')}|${m.cover_crop}`
    const last = out[out.length - 1]
    const lastKey = !last ? null : 'bare' in last ? '' : `${last.crops.join('+')}|${last.cover}`
    if (last && lastKey === key) last.end = i
    else if (key === '') out.push({ start: i, end: i, bare: true })
    else out.push({ start: i, end: i, crops: m.crops, cover: m.cover_crop })
  })
  return out
}

function CropRow({ year }: { year: FarmMonth[] }) {
  return (
    <>
      {cropBands(year).map((b) => {
        const span = b.end - b.start + 1
        const months = year.slice(b.start, b.end + 1)
        if ('bare' in b) {
          return (
            <td key={b.start} colSpan={span} className={cx(cellBase, fg.fg3)}>
              <span aria-hidden="true">–</span>
              <span className="sr-only">
                {MONTH_FULL[b.start]}
                {span > 1 ? ` to ${MONTH_FULL[b.end]}` : ''}: no crop
              </span>
            </td>
          )
        }
        const name = b.crops.join(' + ')
        const stages = months
          .map((m, k) => (m.crops.length === 1 && m.stage && STAGE[m.stage] ? `${STAGE[m.stage]!.label} in ${MONTH_FULL[b.start + k]}` : null))
          .filter(Boolean)
        return (
          <td key={b.start} colSpan={span} className={cellBase}>
            <div
              className={cx(
                'flex h-full flex-col justify-center gap-0.5 rounded-md px-1',
                b.cover
                  ? 'border border-dashed border-[color:var(--color-accent,#4ade80)] bg-[repeating-linear-gradient(135deg,rgba(74,222,128,0.10)_0_6px,transparent_6px_12px)]'
                  : 'bg-[rgba(74,222,128,0.22)]',
              )}
            >
              <span className={cx('truncate text-[12px] font-semibold leading-tight', fg.fg)}>
                {name}
                {b.cover && <span className={cx('font-normal', fg.fg2)}> (cover)</span>}
              </span>
              <span className="grid" style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }} aria-hidden="true">
                {months.map((m, k) => {
                  // With two crops in one month the backend stage belongs to the older crop only, so no mark.
                  const st = m.stage && m.crops.length === 1 ? STAGE[m.stage] : undefined
                  const Icon = st?.icon
                  return (
                    <span key={k} className="flex justify-center text-[color:var(--color-accent,#4ade80)]">
                      {Icon ? <Icon size={13} /> : <span className="h-[13px]" />}
                    </span>
                  )
                })}
              </span>
              <span className="sr-only">
                , {MONTH_FULL[b.start]}
                {span > 1 ? ` to ${MONTH_FULL[b.end]}` : ''}
                {stages.length ? `; ${stages.join(', ')}` : ''}
              </span>
            </div>
          </td>
        )
      })}
    </>
  )
}

function BareCell({ m }: { m: FarmMonth }) {
  if (!m.bare) {
    return (
      <td className={cellBase}>
        <span className="sr-only">{MONTH_FULL[m.month - 1]}: covered</span>
      </td>
    )
  }
  return (
    <td className={cellBase}>
      <span
        className="flex h-full items-center justify-center rounded-md text-[12px] font-semibold text-[#f5c9a8]"
        style={{
          background: `repeating-linear-gradient(45deg, ${CHART_COLORS.bare}55 0 4px, transparent 4px 9px)`,
        }}
      >
        Bare
      </span>
    </td>
  )
}

function GreenCell({ v, month }: { v: number | null; month: number }) {
  if (v === null) {
    return (
      <td className={cx(cellBase, fg.fg3)}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{MONTH_FULL[month - 1]}: no satellite reading</span>
      </td>
    )
  }
  const h = Math.max(2, Math.min(1, Math.max(0, v) / 0.8) * 28)
  return (
    <td className={cellBase} title={`Greenness ${v.toFixed(2)}`}>
      <span className="flex h-full flex-col items-center justify-end gap-0.5">
        <span
          aria-hidden="true"
          className="w-4 rounded-sm"
          style={{ height: h, background: v < 0.2 ? CHART_COLORS.bare : CHART_COLORS.ndvi }}
        />
        <span className={cx('text-[11px] leading-none', tabular, fg.fg2)}>{v.toFixed(2)}</span>
      </span>
    </td>
  )
}

// --------------------------------------------------------------------- strip
function RowHead({ children, sub, term }: { children: ReactNode; sub?: string; term?: GlossaryId }) {
  return (
    <th
      scope="row"
      className={cx(
        'sticky left-0 z-[1] w-[112px] min-w-[112px] bg-[rgba(10,34,22,0.96)] py-1 pr-2 text-left text-[13px] font-semibold leading-tight',
        fg.fg2,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {term && <Term id={term} iconOnly />}
      </span>
      {sub && <span className={cx('block text-[11px] font-normal', fg.fg3)}>{sub}</span>}
    </th>
  )
}

/**
 * "Your farm's year": 12 months of what is on the field and which risks hit when.
 * A real table so screen readers can move by row and column. Wide: scrolls in its own box.
 */
export default function FarmYearStrip({
  year,
  caption,
  ndviFallback,
}: {
  year: FarmMonth[]
  caption: string
  ndviFallback?: (number | null)[] | null
}) {
  const months = [...year].sort((a, b) => a.month - b.month).slice(0, 12)
  const has = (k: keyof FarmMonth) => months.some((m) => typeof m[k] === 'number')
  const green = months.map((m, i) => {
    const v = typeof m.ndvi === 'number' ? m.ndvi : ndviFallback?.[i]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  })
  const anyGreen = green.some((v) => v !== null)
  const anyOpportunity = months.some((m) => m.opportunity)

  return (
    <div
      role="region"
      aria-label={`${caption}, scrolls sideways`}
      tabIndex={0}
      className="overflow-x-auto rounded-xl focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent,#4ade80)]"
    >
      <table className="w-full min-w-[760px] table-fixed border-collapse">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col className="w-[112px]" />
          {months.map((m) => (
            <col key={m.month} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={cx('sticky left-0 z-[1] bg-[rgba(10,34,22,0.96)] text-left text-[12px] font-normal', fg.fg3)}>
              Month
            </th>
            {months.map((m) => (
              <th key={m.month} scope="col" className={cx('pb-1 text-center text-[12px] font-semibold', fg.fg2)}>
                <abbr title={MONTH_FULL[m.month - 1]} className="no-underline">
                  {MONTH_LABELS[m.month - 1]}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-[color:var(--color-glass-border,rgba(190,242,220,0.12))]">
          <tr>
            <RowHead>Crop on field</RowHead>
            <CropRow year={months} />
          </tr>
          <tr>
            <RowHead term="living_roots">Bare soil</RowHead>
            {months.map((m) => (
              <BareCell key={m.month} m={m} />
            ))}
          </tr>
          {has('heat_risk') && (
            <tr>
              <RowHead term="heat_days">Heat risk</RowHead>
              {months.map((m) => (
                <RiskCell key={m.month} v={m.heat_risk} month={m.month} what="Heat risk" />
              ))}
            </tr>
          )}
          {has('frost_risk') && (
            <tr>
              <RowHead term="frost_risk">Frost risk</RowHead>
              {months.map((m) => (
                <RiskCell key={m.month} v={m.frost_risk} month={m.month} what="Frost risk" />
              ))}
            </tr>
          )}
          {has('dry_risk') && (
            <tr>
              <RowHead sub="rain short of crop need">Too dry</RowHead>
              {months.map((m) => (
                <RiskCell key={m.month} v={m.dry_risk} month={m.month} what="Too dry" />
              ))}
            </tr>
          )}
          {has('heavy_rain_risk') && (
            <tr>
              <RowHead sub="a day of 25 mm or more" term="erosion_risk">Heavy rain</RowHead>
              {months.map((m) => (
                <RiskCell
                  key={m.month}
                  v={m.heavy_rain_risk}
                  month={m.month}
                  what="Heavy rain"
                  extra={
                    m.erosion_alert ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-[rgba(233,150,95,0.3)] px-1 text-[10px] text-[#f5c9a8]">
                        <Waves size={10} aria-hidden="true" />
                        Soil loss
                        <span className="sr-only">: bare soil may wash away</span>
                      </span>
                    ) : undefined
                  }
                />
              ))}
            </tr>
          )}
          {anyOpportunity && (
            <tr>
              <RowHead sub="for a short or cover crop">Free window</RowHead>
              {months.map((m) => (
                <td key={m.month} className={cellBase}>
                  {m.opportunity ? (
                    <span className="flex h-full flex-col items-center justify-center rounded-md bg-[rgba(74,222,128,0.14)] text-[11px] font-semibold text-[color:var(--color-accent,#4ade80)]">
                      <Sparkles size={13} aria-hidden="true" />
                      Window
                    </span>
                  ) : (
                    <span className="sr-only">{MONTH_FULL[m.month - 1]}: no window</span>
                  )}
                </td>
              ))}
            </tr>
          )}
          {anyGreen && (
            <tr>
              <RowHead sub="satellite, whole area" term="ndvi">Greenness</RowHead>
              {months.map((m, i) => (
                <GreenCell key={m.month} v={green[i]} month={m.month} />
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Legend shared by all strips on the page (icon + colour + word, never colour alone). */
export function FarmYearLegend() {
  const item = (node: ReactNode, text: string) => (
    <li className="inline-flex items-center gap-1.5">
      {node}
      <span>{text}</span>
    </li>
  )
  return (
    <ul className={cx('m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px]', fg.fg2)} aria-label="How to read this">
      {item(<Sprout size={14} aria-hidden="true" className={fg.accent} />, 'Sowing')}
      {item(<Flower2 size={14} aria-hidden="true" className={fg.accent} />, 'Flowering')}
      {item(<Wheat size={14} aria-hidden="true" className={fg.accent} />, 'Harvest')}
      {item(
        <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-dashed border-[color:var(--color-accent,#4ade80)]" />,
        'Cover crop',
      )}
      {item(<span className={cx('rounded px-1 text-[12px] font-semibold', RISK_STYLE.low.cls)}>Low</span>, 'in fewer than 2 of 10 years')}
      {item(
        <span className={cx('inline-flex items-center gap-0.5 rounded px-1 text-[12px] font-semibold', RISK_STYLE.some.cls)}>
          <TriangleAlert size={12} aria-hidden="true" />
          Some
        </span>,
        '2 to 5 of 10 years',
      )}
      {item(
        <span className={cx('inline-flex items-center gap-0.5 rounded px-1 text-[12px] font-semibold', RISK_STYLE.high.cls)}>
          <OctagonAlert size={12} aria-hidden="true" />
          High
        </span>,
        'more than 5 of 10 years',
      )}
      {item(<span className={cx('px-1 font-semibold', fg.fg3)}>–</span>, 'not relevant that month')}
    </ul>
  )
}
