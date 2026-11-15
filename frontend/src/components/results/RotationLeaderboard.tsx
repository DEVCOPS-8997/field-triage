import { ChevronRight, Eye, EyeOff } from 'lucide-react'
import Term from '../ui/Term'
import type { RotationScore } from '../../types/api'
import { CHART_COLORS } from '../../lib/charts/tokens'
import { Badge, Marker } from '../../lib/ui4/primitives'
import { cx, fg, surface, tabular, type } from '../../lib/ui4/cls'
import { ScoreBar, scoredComponents, strategyLabel } from './shared'

const CONF_TONE = { HIGH: 'accent', MEDIUM: 'warn', LOW: 'danger' } as const

/**
 * Ranked comparison of every rotation. Each row is a button that opens the rotation's
 * detail panel. Overall score bar carries the historical range as a whisker.
 */
export default function RotationLeaderboard({
  rotations,
  selectedId,
  onSelect,
  showAll,
  onToggleAll,
  totalCount,
}: {
  rotations: RotationScore[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Shortlist mode: whether every rotation is listed. Leave undefined when there is no shortlist. */
  showAll?: boolean
  onToggleAll?: () => void
  /** Number of rotations behind "Show all N rotations". */
  totalCount?: number
}) {
  const comps = scoredComponents(rotations)
  const four = comps.length === 4
  const lgCols = four
    ? 'lg:grid-cols-[40px_minmax(0,1.6fr)_minmax(0,1.4fr)_repeat(4,56px)_24px]'
    : 'lg:grid-cols-[40px_minmax(0,1.6fr)_minmax(0,1.4fr)_repeat(3,64px)_24px]'
  return (
    <div className={cx(surface.glass, 'flex flex-col gap-2 p-3 md:p-4')}>
      <div
        aria-hidden="true"
        className={cx(
          'hidden px-3 lg:grid lg:gap-4',
          lgCols,
          type.label,
          fg.fg3,
        )}
      >
        <span>Rank</span>
        <span>Rotation</span>
        <span>Overall (bar) and yearly range (whisker)</span>
        {comps.map((c) => (
          <span key={c.key} className="inline-flex items-center justify-end gap-1">
            <Marker shape={c.shape} color={CHART_COLORS[c.key]} />
            {c.label.slice(0, 5)}
          </span>
        ))}
        <span />
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Rotations ranked best first">
        {rotations.map((r) => {
          const selected = r.rotation_id === selectedId
          return (
            <li key={r.rotation_id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(r.rotation_id)}
                className={cx(
                  'grid w-full grid-cols-[40px_minmax(0,1fr)_24px] items-center gap-x-3 gap-y-2 rounded-[var(--radius-control,1rem)] border p-3 text-left',
                  lgCols,
                  'lg:gap-4',
                  'transition-colors motion-safe:duration-150',
                  selected
                    ? 'border-[color:var(--color-accent,#4ade80)] bg-[rgba(74,222,128,0.10)]'
                    : 'border-transparent bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.07)]',
                  r.is_existing && !selected && 'border-dashed border-[color:var(--color-glass-border,rgba(190,242,220,0.4))]',
                )}
              >
                <span
                  className={cx(
                    'flex h-9 w-9 items-center justify-center rounded-full font-semibold',
                    tabular,
                    r.rank === 1
                      ? 'bg-[color:var(--color-accent,#4ade80)] text-[#06240f]'
                      : 'bg-[rgba(255,255,255,0.08)] text-[color:var(--color-fg,#ecfdf3)]',
                  )}
                >
                  {r.rank}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className={cx('truncate font-semibold', type.body, fg.fg)}>{r.label}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {r.is_existing && <Badge tone="neutral">Your current</Badge>}
                    {r.shortlist_reason && !r.is_existing && <Badge tone="accent">{r.shortlist_reason}</Badge>}
                    {r.fits_constraints === false && <Badge tone="danger">Doesn't fit your farm</Badge>}
                    <span className={cx(type.label, fg.fg3)}>{strategyLabel(r.strategy_type)}</span>
                    <span className={cx(type.label, fg.fg3)} aria-hidden="true">·</span>
                    <span className={cx(type.label, CONF_TONE[r.confidence] === 'accent' ? fg.accent : CONF_TONE[r.confidence] === 'warn' ? fg.demo : fg.danger)}>
                      {r.confidence.toLowerCase()} confidence
                    </span>
                  </span>
                  {r.fits_constraints === false && (r.constraint_failures?.length ?? 0) > 0 && (
                    <span className={cx('mt-1 flex flex-col gap-0.5 rounded-lg bg-[rgba(253,164,175,0.10)] px-2 py-1.5 text-[13px]', fg.fg2)}>
                      <span className={cx('font-semibold', fg.danger)}>Doesn't fit your farm because:</span>
                      {r.constraint_failures!.map((f) => (
                        <span key={f} className="flex gap-1.5">
                          <span aria-hidden="true">•</span>
                          <span>{f}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <ChevronRight
                  size={20}
                  aria-hidden="true"
                  className={cx('justify-self-end lg:order-last', selected ? fg.accent : fg.fg3)}
                />
                <span className="col-span-3 flex items-center gap-3 lg:col-span-1">
                  <span className={cx('w-9 shrink-0 text-right text-[20px] font-semibold', tabular, fg.fg)}>
                    {r.overall.toFixed(0)}
                  </span>
                  <ScoreBar
                    value={r.overall}
                    low={r.overall_low}
                    high={r.overall_high}
                    label={`${r.label} overall`}
                    color={r.is_existing ? CHART_COLORS.existing : 'var(--color-accent,#4ade80)'}
                  />
                </span>
                <span className={cx('col-span-3 grid gap-2 lg:contents', four ? 'grid-cols-4' : 'grid-cols-3')}>
                  {comps.map((c) => {
                    const v = r.scores[c.key]
                    return (
                      <span key={c.key} className="flex flex-col items-start lg:items-end">
                        <span className={cx('inline-flex items-center gap-1 lg:hidden', type.label, fg.fg3)}>
                          <Marker shape={c.shape} color={CHART_COLORS[c.key]} />
                          {c.label}
                        </span>
                        <span className={cx('font-semibold', tabular, fg.fg)}>
                          {typeof v === 'number' ? v.toFixed(0) : 'n/a'}
                        </span>
                      </span>
                    )
                  })}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className={cx('m-0 flex items-center gap-1 px-1', type.label, fg.fg3)}>
        Thin line on each bar: the score <Term id="percentile_range">range</Term> across past years.
      </p>
      {onToggleAll && showAll !== undefined && (
        <button
          type="button"
          onClick={onToggleAll}
          aria-expanded={showAll}
          className={cx(
            'inline-flex min-h-[44px] items-center gap-2 self-start rounded-[var(--radius-control,1rem)] border px-4 font-semibold',
            'border-[color:var(--color-control-border,rgba(190,242,220,0.45))] hover:bg-[rgba(255,255,255,0.08)]',
            type.label,
            fg.fg,
          )}
        >
          {showAll ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          {showAll ? 'Show the shortlist only' : `Show all ${totalCount ?? rotations.length} rotations`}
        </button>
      )}
    </div>
  )
}
