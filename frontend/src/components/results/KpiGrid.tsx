import { CloudRain, Droplets, Flame, Sprout, Sun, ThermometerSun, Timer, Waves, type LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import type { FieldProfile } from '../../types/api'
import { aridityClass, fmt, num, StatTile } from './shared'

type Tile = Omit<ComponentProps<typeof StatTile>, 'icon'> & { icon: LucideIcon; key: string; show: boolean }

/**
 * Headline climate numbers computed from the NASA POWER daily record for this grid cell.
 * A tile is only shown when its value was actually computed; nothing is filled in.
 */
export default function KpiGrid({ profile }: { profile: FieldProfile }) {
  const c = profile.climatology
  const rain = num(c.rain_annual_mm_mean)
  const cv = num(c.rain_annual_cv)
  const eto = num(c.eto_annual_mm_mean)
  const ai = num(c.aridity_index_p_over_eto)
  const deficit = num(c.water_deficit_annual_mm_mean)
  const gdd = num(c.gdd_base10_annual_mean)
  const dry = num(c.dry_spell_max_days_mean)
  const wet = num(c.gwetroot_mean)
  const trend = num(c.tmean_trend_c_per_decade)
  const pm = num(c.eto_penman_monteith_share)

  const tiles: Tile[] = [
    {
      key: 'rain', show: rain !== null, icon: CloudRain, label: 'Rain per year', value: fmt(rain), unit: 'mm',
      caption: cv !== null ? `changes about ±${Math.round(cv * 100)}% from year to year` : undefined, tone: 'info',
    },
    {
      key: 'eto', show: eto !== null, icon: Sun, label: 'Water the air pulls out', value: fmt(eto), unit: 'mm/yr',
      caption: pm !== null && pm < 0.9 ? 'partly a temperature-only estimate' : 'from sun, heat, wind and humidity (FAO-56)', tone: 'warn',
    },
    {
      key: 'ai', show: ai !== null, icon: Waves, label: 'Rain vs. drying (aridity)', value: fmt(ai, 2),
      caption: `${aridityClass(ai)} by the UN (UNEP) scale`, tone: ai !== null && ai < 0.5 ? 'warn' : 'accent',
    },
    {
      key: 'deficit', show: deficit !== null, icon: Droplets, label: 'Yearly water shortfall', value: fmt(deficit), unit: 'mm/yr',
      caption: 'drying the rain does not cover', tone: deficit !== null && deficit > 500 ? 'danger' : 'neutral',
    },
    { key: 'gdd', show: gdd !== null, icon: Sprout, label: 'Growing heat', value: fmt(gdd), unit: '°C·days', caption: 'warmth above 10 °C each year', tone: 'accent' },
    { key: 'dry', show: dry !== null, icon: Timer, label: 'Longest dry spell', value: fmt(dry), unit: 'days', caption: 'average worst run each year', tone: 'neutral' },
    {
      key: 'wet', show: wet !== null, icon: Flame, label: 'Root-zone wetness', value: fmt(wet, 2), unit: '0 dry – 1 wet',
      caption: 'NASA model value, not a field sensor', tone: wet !== null && wet < 0.3 ? 'danger' : 'info',
    },
    {
      key: 'trend', show: trend !== null, icon: ThermometerSun, label: 'Warming trend',
      value: trend === null ? '' : `${trend > 0 ? '+' : ''}${trend.toFixed(2)}`, unit: '°C per 10 yrs',
      caption: `over ${profile.n_years} complete years`, tone: trend !== null && trend > 0.2 ? 'danger' : 'neutral',
    },
  ]
  const shown = tiles.filter((t) => t.show)
  if (shown.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {shown.map(({ key, show: _show, ...t }) => (
        <StatTile key={key} {...t} />
      ))}
    </div>
  )
}
