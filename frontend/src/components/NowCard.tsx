import { useId, type ReactNode } from 'react'
import { CircleCheck, CircleHelp, CloudRain, Droplets, Eye, Leaf, Thermometer, TriangleAlert } from 'lucide-react'
import type { FieldProfile, Quality } from '../types/api'
import DataQualityBadge from './DataQualityBadge'
import IllustrativeBadge from './IllustrativeBadge'
import { NO_OBSERVATION, formatDate, formatValue } from '../lib/honesty/format'
import { NOW_THRESHOLDS, assessNow, readNow, type NowStatus } from '../lib/honesty/nowStatus'
import { Term } from './ui/Term'
import type { GlossaryId } from '../lib/glossary'
import { badgeBase, badgeTone, cx, surface, tx, type BadgeTone } from '../lib/ui5/styles'

export interface NowCardProps {
  now: FieldProfile['now'] | null | undefined
  /** Profile `data_quality`; when given, every value carries its source badge. */
  dataQuality?: Record<string, Quality>
  /** Custom badge renderer; defaults to DataQualityBadge. */
  renderBadge?: (q: Quality) => ReactNode
  className?: string
}

const STATUS_STYLE: Record<NowStatus, { tone: BadgeTone; Icon: typeof CircleCheck }> = {
  FAVORABLE: { tone: 'accent', Icon: CircleCheck },
  WATCH: { tone: 'warn', Icon: Eye },
  STRESSED: { tone: 'danger', Icon: TriangleAlert },
}

type SourceKey = 'power' | 'smap' | 'modis'
const SOURCE_NAME: Record<SourceKey, string> = { power: 'NASA POWER', smap: 'SMAP L4', modis: 'MODIS NDVI' }

interface Metric {
  label: string
  term?: GlossaryId
  value: number | null
  unit?: string
  digits: number
  source: SourceKey
  Icon: typeof CloudRain
}

export default function NowCard({ now, dataQuality, renderBadge, className }: NowCardProps) {
  const titleId = useId()
  const v = readNow(now)
  const { status, reasons } = assessNow(v)
  const badge = renderBadge ?? ((q: Quality) => <DataQualityBadge quality={q} />)

  const metrics: Metric[] = [
    { label: 'Rain, last 7 days', value: v.rain_7d_mm, unit: 'mm', digits: 1, source: 'power', Icon: CloudRain },
    { label: 'Rain, last 14 days', value: v.rain_14d_mm, unit: 'mm', digits: 1, source: 'power', Icon: CloudRain },
    { label: 'Rain, last 30 days', value: v.rain_30d_mm, unit: 'mm', digits: 1, source: 'power', Icon: CloudRain },
    { label: 'Mean temperature, 7 days', value: v.mean_temp_7d_c, unit: '°C', digits: 1, source: 'power', Icon: Thermometer },
    { label: 'Max temperature, 7 days', value: v.max_temp_7d_c, unit: '°C', digits: 1, source: 'power', Icon: Thermometer },
    { label: 'Root-zone moisture', term: 'rootzone', value: v.rootzone_latest_m3m3, unit: 'm³/m³', digits: 3, source: 'smap', Icon: Droplets },
    { label: 'NDVI (vegetation)', term: 'ndvi', value: v.ndvi_latest, digits: 2, source: 'modis', Icon: Leaf },
  ]

  const statusStyle = status ? STATUS_STYLE[status] : null

  return (
    <section
      data-component="NowCard"
      data-status={status ?? 'none'}
      aria-labelledby={titleId}
      className={cx(surface.glass, 'flex flex-col gap-4 p-4 md:p-6', tx.fg, className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className={cx('m-0', tx.heading)}>
            Right now
          </h2>
          <p className={cx('m-0 font-normal', tx.label, tx.fg3)}>Illustrative status from the last 30 days</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statusStyle && status ? (
            <span className={cx(badgeBase, badgeTone[statusStyle.tone])} data-now-status={status}>
              <statusStyle.Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only">Status: </span>
              {status}
            </span>
          ) : (
            <span className={cx(badgeBase, badgeTone.neutral, 'border-dotted')}>
              <CircleHelp size={16} strokeWidth={1.75} aria-hidden="true" />
              No status
            </span>
          )}
          <IllustrativeBadge validated={NOW_THRESHOLDS.validated} />
        </div>
      </header>

      <ul aria-label="Why this status" className={cx('m-0 flex list-disc flex-col gap-1 pl-6', tx.body, tx.fg2)}>
        {reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <dl className="m-0 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m) => {
          const missing = m.value === null
          const date = v.latest_dates[m.source]
          const q = dataQuality ? (missing ? 'unavailable' : (dataQuality[m.source] ?? 'unavailable')) : null
          return (
            <div
              key={m.label}
              data-metric={m.label}
              className={cx(surface.flat, surface.radiusControl, 'flex min-w-0 flex-col gap-1 p-4')}
            >
              <dt className={cx('flex items-center gap-2 font-semibold', tx.label, tx.fg2)}>
                <m.Icon size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
                {m.term ? <Term id={m.term}>{m.label}</Term> : m.label}
              </dt>
              <dd className="m-0 flex flex-wrap items-center justify-between gap-2">
                <span
                  className={cx(
                    tx.num,
                    missing ? cx(tx.label, tx.fg3, 'font-normal') : cx(tx.body, 'font-semibold'),
                  )}
                >
                  {missing ? NO_OBSERVATION : formatValue(m.value, m.unit, { digits: m.digits })}
                </span>
                {q && badge(q)}
              </dd>
              <dd className={cx('m-0 font-normal', tx.label, tx.fg3, tx.num)}>
                {SOURCE_NAME[m.source]}
                {date ? `, latest ${formatDate(date)}` : ', no date'}
              </dd>
            </div>
          )
        })}
      </dl>

      <p className={cx('m-0 font-normal', tx.label, tx.fg3)}>
        Thresholds: watch if 30-day rain is below {NOW_THRESHOLDS.rain_30d_dry_mm} mm, root-zone moisture is
        below {NOW_THRESHOLDS.rootzone_dry_m3m3} m³/m³, or the 7-day mean maximum reaches{' '}
        {NOW_THRESHOLDS.max_temp_7d_hot_c} °C; stressed if rain and moisture are both below their thresholds. Not
        validated against local references, and not a forecast.
      </p>
    </section>
  )
}
