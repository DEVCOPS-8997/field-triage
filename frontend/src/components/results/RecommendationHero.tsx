import { ArrowDownRight, ArrowRight, ArrowUpRight, Award, Minus } from 'lucide-react'
import type { RotationScore } from '../../types/api'
import { CHART_COLORS } from '../../lib/charts/tokens'
import { Badge, Marker } from '../../lib/ui4/primitives'
import { ConfidencePill } from '../../lib/ui/Pill'
import { cx, fg, surface, tabular, type } from '../../lib/ui4/cls'
import { ScoreRing, scoredComponents, scoreWord, strategyLabel } from './shared'

function Delta({ d }: { d: number }) {
  const r = Math.round(d)
  const Icon = r > 0 ? ArrowUpRight : r < 0 ? ArrowDownRight : Minus
  const cls = r > 0 ? fg.accent : r < 0 ? fg.danger : fg.fg3
  return (
    <span className={cx('inline-flex items-center gap-0.5 font-semibold', tabular, cls)}>
      <Icon size={14} aria-hidden="true" />
      {r > 0 ? `+${r}` : r}
    </span>
  )
}

/** Headline answer: the best-fit rotation against the farmer's current one. */
export default function RecommendationHero({
  best,
  current,
  total,
  onDetails,
}: {
  best: RotationScore
  current: RotationScore | undefined
  total: number
  onDetails: (id: string) => void
}) {
  const currentIsBest = !current || current.rotation_id === best.rotation_id
  const gain = current ? best.overall - current.overall : 0
  const close = !currentIsBest && gain < 3

  return (
    <div
      className={cx(
        surface.glass,
        'relative overflow-hidden p-5 md:p-6',
        'bg-[linear-gradient(135deg,rgba(74,222,128,0.16),rgba(16,48,32,0.7)_55%)]',
      )}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
        <div className="flex min-w-0 flex-col gap-3">
          <span className={cx('inline-flex items-center gap-2 font-semibold uppercase tracking-[0.08em]', type.label, fg.accent)}>
            <Award size={16} aria-hidden="true" />
            {currentIsBest ? 'Your rotation already ranks first' : 'Best fit for this location'}
          </span>
          <h2 className={cx('m-0', type.display, fg.fg, 'text-[32px] md:text-[40px]')}>{best.label}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Rank 1 of {total}</Badge>
            <Badge tone="info">{strategyLabel(best.strategy_type)}</Badge>
            <ConfidencePill confidence={best.confidence} />
          </div>
          <p className={cx('m-0 max-w-[60ch]', type.body, fg.fg2)}>
            {currentIsBest
              ? 'None of the alternatives scored higher with your priorities and the 20-year NASA record for this point.'
              : close
                ? `Only ${gain.toFixed(1)} points ahead of your current ${current!.label}. Treat the two as roughly equal and weigh local factors.`
                : `Scores ${gain.toFixed(0)} points above your current ${current!.label} with your priorities and the 20-year NASA record for this point.`}
          </p>
          <button
            type="button"
            onClick={() => onDetails(best.rotation_id)}
            className={cx(
              'inline-flex min-h-[44px] items-center gap-2 self-start rounded-[var(--radius-control,1rem)] px-4 font-semibold',
              'bg-[color:var(--color-accent,#4ade80)] text-[#06240f] hover:brightness-110 active:scale-[0.98]',
              type.label,
            )}
          >
            Why this rotation
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>

        <div className={cx(surface.flat, 'flex flex-col gap-3 p-4')}>
          <div className="flex items-center gap-4">
            <ScoreRing value={best.overall} caption={`${scoreWord(best.overall)} / 100`} />
            <div className="flex min-w-0 flex-col gap-1">
              <span className={cx(type.label, fg.fg3)}>Overall score</span>
              <span className={cx(type.label, fg.fg2, tabular)}>
                Range {best.overall_low.toFixed(0)} to {best.overall_high.toFixed(0)} across the years of record
              </span>
              {!currentIsBest && current && (
                <span className={cx('flex items-center gap-2', type.label, fg.fg3)}>
                  vs your current
                  <span className="text-[20px]">
                    <Delta d={gain} />
                  </span>
                </span>
              )}
            </div>
          </div>
          <table className={cx('w-full border-collapse', type.label)}>
            <caption className="sr-only">Component scores for {best.label} compared with the current rotation</caption>
            <thead>
              <tr className={fg.fg3}>
                <th scope="col" className="py-1 text-left font-normal">Component</th>
                <th scope="col" className="py-1 text-right font-normal">Score</th>
                {!currentIsBest && <th scope="col" className="py-1 text-right font-normal">Change</th>}
              </tr>
            </thead>
            <tbody>
              {scoredComponents(current ? [best, current] : [best]).map((c) => {
                const v = best.scores[c.key]
                const cur = current?.scores[c.key]
                return (
                  <tr key={c.key} className="border-t border-[color:var(--color-glass-border,rgba(190,242,220,0.16))]">
                    <th scope="row" className={cx('py-1.5 text-left font-semibold', fg.fg2)}>
                      <span className="inline-flex items-center gap-2">
                        <Marker shape={c.shape} color={CHART_COLORS[c.key]} />
                        {c.label}
                      </span>
                    </th>
                    <td className={cx('py-1.5 text-right font-semibold', tabular, fg.fg)}>
                      {typeof v === 'number' ? v.toFixed(0) : 'n/a'}
                    </td>
                    {!currentIsBest && (
                      <td className="py-1.5 text-right">
                        {typeof v === 'number' && typeof cur === 'number' ? <Delta d={v - cur} /> : 'n/a'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
