import { CircleCheck, CloudRain, Droplets, Eye, Thermometer, TriangleAlert } from 'lucide-react'
import type { FieldProfile, NowStatusValue } from '../../types/api'
import { Badge, Card } from '../../lib/ui4/primitives'
import { cx, fg, surface, tabular, type } from '../../lib/ui4/cls'
import { fmt, num } from './shared'

const STATUS = {
  FAVORABLE: { tone: 'accent', icon: CircleCheck, text: 'Favourable' },
  WATCH: { tone: 'warn', icon: Eye, text: 'Watch' },
  STRESSED: { tone: 'danger', icon: TriangleAlert, text: 'Stressed' },
} as const

/** Last 30 days at this grid cell from NASA POWER (near-real-time, not a forecast). */
export default function NowPanel({
  status,
  reasons,
  now,
}: {
  status: NowStatusValue
  reasons: string[]
  now: FieldProfile['now']
}) {
  const st = STATUS[status] ?? STATUS.WATCH
  const dates = (now.latest_dates ?? {}) as Record<string, string | null>
  const rain = [
    { label: '7 days', v: num(now.rain_7d_mm) },
    { label: '14 days', v: num(now.rain_14d_mm) },
    { label: '30 days', v: num(now.rain_30d_mm) },
  ].filter((r) => r.v !== null)
  const maxRain = Math.max(10, ...rain.map((r) => r.v ?? 0))
  const wet = num(now.rootzone_wetness_latest)
  const tiles = [
    { key: 'mean', icon: Thermometer, label: 'Mean 7 d', value: num(now.mean_temp_7d_c), fmtv: (v: number) => `${fmt(v, 1)} °C` },
    { key: 'max', icon: Thermometer, label: 'Max 7 d', value: num(now.max_temp_7d_c), fmtv: (v: number) => `${fmt(v, 1)} °C` },
    { key: 'wet', icon: Droplets, label: 'Root zone', value: wet, fmtv: (v: number) => `${Math.round(v * 100)}%` },
  ].filter((t) => t.value !== null)
  // No recent observations at all -> no card (nothing to show is better than a card of "n/a").
  if (rain.length === 0 && tiles.length === 0) return null

  return (
    <Card
      title="Current conditions"
      actions={
        <Badge tone={st.tone} icon={st.icon}>
          {st.text}
        </Badge>
      }
    >
      <ul className={cx('m-0 flex flex-col gap-1 pl-5', type.label, fg.fg2)}>
        {reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      {rain.length > 0 && <div className="flex flex-col gap-2">
        <span className={cx('flex items-center gap-2 font-semibold', type.label, fg.fg2)}>
          <CloudRain size={16} aria-hidden="true" /> Recent rain
        </span>
        {rain.map((r) => (
          <div key={r.label} className="grid grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-2">
            <span className={cx(type.label, fg.fg3)}>{r.label}</span>
            <div className="h-2.5 rounded-full bg-[rgba(255,255,255,0.08)]">
              <div className="h-full rounded-full bg-[#38bdf8]" style={{ width: `${((r.v ?? 0) / maxRain) * 100}%` }} />
            </div>
            <span className={cx('text-right font-semibold', type.label, fg.fg, tabular)}>{fmt(r.v, 1)} mm</span>
          </div>
        ))}
      </div>}

      {tiles.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
          {tiles.map((t) => (
            <div key={t.key} className={cx(surface.flat, 'flex flex-col p-3')}>
              <span className={cx('flex items-center gap-1', type.label, fg.fg3)}>
                <t.icon size={14} aria-hidden="true" /> {t.label}
              </span>
              <span className={cx('font-semibold', type.body, fg.fg, tabular)}>{t.fmtv(t.value as number)}</span>
            </div>
          ))}
        </div>
      )}
      <p className={cx('m-0 text-[12px]', fg.fg3)}>
        NASA POWER near-real-time data{dates.power ? `, latest day ${dates.power}` : ''}. Root-zone wetness is GWETROOT (0 to
        100% of saturation). This is a status snapshot, not a forecast.
      </p>
    </Card>
  )
}
