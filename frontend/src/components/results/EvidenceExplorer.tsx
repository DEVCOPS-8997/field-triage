import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { CloudSun, Coins, Droplets, Layers, Mountain, Sprout, Tractor, type LucideIcon } from 'lucide-react'
import type { EvidenceGroup, EvidenceItem } from '../../types/api'
import { cx, fg, tabular, type } from '../../lib/ui4/cls'
import { SourceChip } from './InsightAccordion'
import { Term } from '../ui/Term'
import type { GlossaryId } from '../../lib/glossary'

/** Evidence variables that carry a science word, explained with a Term popover. */
const TERM_FOR: Record<string, GlossaryId> = {
  eto_annual_mm_mean: 'eto',
  gwetroot_mean: 'rootzone',
  smap_rootzone_m3m3: 'rootzone',
  soil_moisture_anomaly: 'soil_moisture_anomaly',
  mean_effective_rain_mm: 'effective_rain',
  mean_season_water_demand_mm: 'water_balance',
  mean_season_water_deficit_mm: 'water_balance',
  living_root_share: 'living_roots',
  slope_deg: 'erosion_risk',
  heavy_rain_days_ge_25mm_mean: 'erosion_risk',
  ndvi_mean: 'ndvi',
  ndvi_latest: 'ndvi',
}

const GROUPS: { key: EvidenceGroup; label: string; icon: LucideIcon; blurb: string }[] = [
  { key: 'climate', label: 'Climate', icon: CloudSun, blurb: '20+ years of NASA weather for this spot' },
  { key: 'water', label: 'Water', icon: Droplets, blurb: 'Crop water need against rain, soil and irrigation' },
  { key: 'soil', label: 'Soil', icon: Layers, blurb: 'Satellite-model soil estimate, top 30 cm' },
  { key: 'terrain', label: 'Land', icon: Mountain, blurb: 'Slope and height from a 30 m elevation model' },
  { key: 'crop', label: 'Crops', icon: Sprout, blurb: 'What the rotation itself does over the cycle' },
  { key: 'market', label: 'Market', icon: Coins, blurb: 'National yields and farm-gate prices' },
  { key: 'farm', label: 'Your farm', icon: Tractor, blurb: 'What you told us in the form' },
]

function valueText(e: EvidenceItem): string {
  if (typeof e.value === 'number') return e.value.toLocaleString(undefined, { maximumFractionDigits: 1 })
  return String(e.value ?? '')
}

/**
 * Evidence as a side-tab explorer: groups on the left (a scrollable chip row on phones),
 * the measurements of the chosen group on the right. Only groups that hold data appear,
 * so the panel stays one screen tall instead of a long table.
 */
export default function EvidenceExplorer({ items }: { items: EvidenceItem[] }) {
  const base = useId()
  const groups = useMemo(() => {
    const present = GROUPS.map((g) => ({ ...g, items: items.filter((e) => (e.group ?? 'farm') === g.key) }))
    return present.filter((g) => g.items.length > 0)
  }, [items])
  const [active, setActive] = useState<EvidenceGroup | null>(null)
  const current = groups.find((g) => g.key === active) ?? groups[0]

  if (!current) return <p className={cx('m-0', type.label, fg.fg3)}>No measurements were returned for this rotation.</p>

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = groups.findIndex((g) => g.key === current.key)
    const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight'
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft'
    if (!fwd && !back) return
    e.preventDefault()
    const next = groups[(i + (fwd ? 1 : -1) + groups.length) % groups.length]
    setActive(next.key)
    document.getElementById(`${base}-g-${next.key}`)?.focus()
  }

  return (
    <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label="Evidence groups"
        onKeyDown={onKey}
        className="flex gap-1 overflow-x-auto rounded-xl bg-[rgba(0,0,0,0.2)] p-1 md:flex-col md:overflow-visible"
      >
        {groups.map((g) => {
          const on = g.key === current.key
          const Icon = g.icon
          return (
            <button
              key={g.key}
              id={`${base}-g-${g.key}`}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`${base}-p`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(g.key)}
              className={cx(
                'relative inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg px-3 text-left font-semibold transition-colors motion-safe:duration-150',
                type.label,
                on
                  ? 'bg-[rgba(74,222,128,0.14)] text-[color:var(--color-fg,#ecfdf3)]'
                  : 'text-[color:var(--color-fg-3,#9bbba8)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[color:var(--color-fg,#ecfdf3)]',
              )}
            >
              {on && <span aria-hidden="true" className="absolute inset-y-2 left-0 hidden w-[3px] rounded-full bg-[color:var(--color-accent,#4ade80)] md:block" />}
              <Icon size={16} aria-hidden="true" className={on ? fg.accent : undefined} />
              <span className="flex-1">{g.label}</span>
              <span className={cx('rounded-full bg-[rgba(255,255,255,0.08)] px-1.5 text-[11px]', tabular)}>{g.items.length}</span>
            </button>
          )
        })}
      </div>

      <div id={`${base}-p`} role="tabpanel" aria-labelledby={`${base}-g-${current.key}`} className="evidence-panel flex min-w-0 flex-col gap-2" key={current.key}>
        <p className={cx('m-0', type.label, fg.fg3)}>{current.blurb}</p>
        <ul className="m-0 grid list-none gap-2 p-0 xl:grid-cols-2">
          {current.items.map((e) => (
            <li
              key={e.variable}
              className="flex min-w-0 flex-col gap-2 rounded-xl border border-[color:var(--color-glass-border,rgba(190,242,220,0.14))] bg-[rgba(255,255,255,0.03)] p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className={cx('font-semibold', type.label, fg.fg)}>
                  {TERM_FOR[e.variable] ? <Term id={TERM_FOR[e.variable]}>{e.label ?? e.variable}</Term> : (e.label ?? e.variable)}
                </span>
                <span className={cx('flex items-baseline gap-1', fg.fg)}>
                  <span className={cx('text-[20px] leading-none font-semibold break-all', tabular)}>{valueText(e)}</span>
                  {e.unit && <span className={cx('text-[12px]', fg.fg3)}>{e.unit}</span>}
                </span>
              </div>
              <p className={cx('m-0 leading-snug', type.label, fg.fg2)}>{e.interpretation}</p>
              <SourceChip source={e.source} url={e.source_url} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
