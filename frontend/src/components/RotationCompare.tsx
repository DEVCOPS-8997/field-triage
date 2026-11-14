import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, FlaskConical, RefreshCw, Sprout, TriangleAlert } from 'lucide-react'
import type { RotationScore } from '../types/api'
import { useCompare } from '../api/hooks'
import { GlassCard } from '../lib/ui/GlassCard'
import { Gauge } from '../lib/ui/Gauge'
import { ConfidencePill, Pill } from '../lib/ui/Pill'
import { RangeBar } from '../lib/ui/RangeBar'
import { Skeleton } from '../lib/ui/Skeleton'
import { type ComponentKey, color, componentLabel, fgClass, fmtScore, text, toneColor } from '../lib/ui/tokens'

type Props = {
  fieldId: string
  /** Optional detail slot (e.g. RotationCard) shown for the expanded card. */
  renderDetail?: (r: RotationScore) => ReactNode
}

// Display order of the component bars (matches the priority sliders).
const COMPONENTS: ComponentKey[] = ['water', 'soil', 'income', 'resilience']

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const buttonClass = `inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-[var(--radius-control,1rem)] border px-4 font-semibold ${text.label} bg-[color:var(--color-glass-flat,rgba(255,255,255,0.04))] hover:bg-[rgba(255,255,255,0.08)] active:scale-[0.98] text-[color:var(--color-fg,#ecfdf3)] border-[color:var(--color-control-border,rgba(190,242,220,0.45))]`

/** Redundant shape cue per component (circle, square, diamond, triangle). */
function Marker({ k }: { k: ComponentKey }) {
  const fill = toneColor[k]
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
      {k === 'water' && <circle cx="6" cy="6" r="5" fill={fill} />}
      {k === 'soil' && <rect x="1" y="1" width="10" height="10" rx="1" fill={fill} />}
      {k === 'resilience' && <path d="M6 0.5 L11.5 6 L6 11.5 L0.5 6 Z" fill={fill} />}
      {k === 'income' && <path d="M6 1 L11.5 11 L0.5 11 Z" fill={fill} />}
    </svg>
  )
}

function ComponentBars({ scores }: { scores: Record<string, number> }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Component scores">
      {COMPONENTS.map((k) => {
        const v = scores?.[k]
        const has = isNum(v)
        return (
          <li key={k} className={`grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 ${text.label}`}>
            <span className="flex min-w-0 items-center gap-2 truncate" style={{ color: color.fg2 }}>
              <Marker k={k} />
              {componentLabel[k]}
            </span>
            <span
              aria-hidden="true"
              className="relative h-2 overflow-hidden rounded-full"
              style={{
                background: has ? 'rgba(255,255,255,0.10)' : 'transparent',
                border: has ? undefined : `1px dotted ${color.glassBorder}`,
              }}
            >
              {has && (
                <span
                  className="absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-[250ms]"
                  style={{ width: `${Math.min(100, Math.max(0, v))}%`, background: toneColor[k] }}
                />
              )}
            </span>
            <span className="min-w-[2.5rem] text-right tabular-nums" style={{ color: has ? color.fg : color.fg3 }}>
              <span className="sr-only">{componentLabel[k]}: </span>
              {has ? fmtScore(v) : 'unavailable'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function RankChip({ rank }: { rank: number }) {
  return (
    <span
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border font-semibold tabular-nums ${text.label}`}
      style={{
        borderColor: rank === 1 ? color.accent : color.controlBorder,
        color: rank === 1 ? color.accent : color.fg,
      }}
      aria-label={`Rank ${rank}`}
    >
      #{rank}
    </span>
  )
}

function RotationTile({
  r,
  expanded,
  onToggle,
  detailId,
  hasDetail,
}: {
  r: RotationScore
  expanded: boolean
  onToggle: () => void
  detailId: string
  hasDetail: boolean
}) {
  return (
    <GlassCard
      as="li"
      data-component="RotationCompareCard"
      data-rotation-id={r.rotation_id}
      selected={expanded}
      className="flex min-w-0 flex-col gap-4"
      aria-label={`Rank ${r.rank}: ${r.label}`}
    >
      <div className="flex items-start gap-2">
        <RankChip rank={r.rank} />
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className={`m-0 ${text.body} font-semibold`}>{r.label}</h3>
          <div className="flex flex-wrap gap-2">
            {r.is_existing && (
              <Pill tone="existing" dashed icon={<Sprout size={16} strokeWidth={1.75} />}>
                Current rotation
              </Pill>
            )}
            <Pill tone="neutral" title="Strategy type">
              <span className="sr-only">Strategy type: </span>
              {r.strategy_type}
            </Pill>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Gauge value={r.overall} size="md" tone="accent" label="Overall" />
        <ConfidencePill confidence={r.confidence} />
      </div>

      <RangeBar low={r.overall_low} high={r.overall_high} value={r.overall} label="Uncertainty range" />

      <ComponentBars scores={r.scores} />

      {hasDetail && (
        <button
          type="button"
          className={`${buttonClass} mt-auto w-full`}
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={onToggle}
        >
          {expanded ? (
            <ChevronUp size={20} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
          )}
          {expanded ? 'Hide details' : 'Show details'}
          <span className="sr-only"> for {r.label}</span>
        </button>
      )}
    </GlassCard>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4 md:gap-6" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <GlassCard key={i} className="flex flex-col gap-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="mx-auto size-[120px] rounded-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </GlassCard>
      ))}
    </div>
  )
}

function StateCard({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <GlassCard className="flex flex-col items-start gap-4 py-16" role="status">
      <h3 className={`m-0 ${text.heading}`}>{title}</h3>
      <p className={`m-0 ${text.body} ${fgClass.fg2}`}>{body}</p>
      {action}
    </GlassCard>
  )
}

export default function RotationCompare({ fieldId, renderDetail }: Props) {
  const { data, isLoading, isFetching, error, refetch } = useCompare(fieldId)
  // Expanded card is remembered per field, so switching fields collapses it.
  const [open, setOpen] = useState<{ fieldId: string; id: string } | null>(null)
  const expandedId = open?.fieldId === fieldId ? open.id : null
  const detailRef = useRef<HTMLDivElement>(null)
  const detailId = `rotation-detail-${fieldId}`


  useEffect(() => {
    if (!error) return
    console.error('Compare failed', error)
  }, [error])

  useEffect(() => {
    if (!expandedId || !detailRef.current) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    detailRef.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
  }, [expandedId])

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className={`m-0 ${text.heading}`}>Compare rotations</h2>
        <p className={`m-0 ${text.label} ${fgClass.fg2}`}>
          Ranked by overall score for your priorities. Scores run from 0 to 100.
        </p>
      </div>
      {data?.scenario_applied && (
        <Pill tone="warn" icon={<FlaskConical size={16} strokeWidth={1.75} />}>
          Simulated conditions, not a NASA forecast
        </Pill>
      )}
    </div>
  )

  if (isLoading) {
    return (
      <section data-component="RotationCompare" aria-busy="true">
        {header}
        <span className="sr-only" role="status">
          Loading rotations
        </span>
        <SkeletonGrid />
      </section>
    )
  }

  if (error && !data) {
    return (
      <section data-component="RotationCompare">
        {header}
        <GlassCard className="flex flex-col items-start gap-4" role="alert">
          <div className="flex items-center gap-2" style={{ color: color.danger }}>
            <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
            <h3 className={`m-0 ${text.heading}`}>Could not load the comparison</h3>
          </div>
          <p className={`m-0 ${text.body} ${fgClass.fg2}`}>
            The rotation comparison for {fieldId} did not load. Check your connection, then try again.
          </p>
          <button type="button" className={buttonClass} onClick={() => void refetch()}>
            <RefreshCw size={20} strokeWidth={1.75} aria-hidden="true" />
            Try again
          </button>
        </GlassCard>
      </section>
    )
  }

  const rotations = [...(data?.rotations ?? [])].sort((a, b) => a.rank - b.rank)

  if (rotations.length === 0) {
    return (
      <section data-component="RotationCompare">
        {header}
        <StateCard
          title="No rotations to compare"
          body={`The comparison for ${fieldId} returned no rotations. Go back to the overview and pick another field.`}
        />
      </section>
    )
  }

  const expanded = rotations.find((r) => r.rotation_id === expandedId) ?? null
  const top = rotations[0]

  return (
    <section data-component="RotationCompare" aria-busy={isFetching}>
      {header}
      <p className="sr-only" aria-live="polite">
        Top ranked: {top.label}, overall {isNum(top.overall) ? fmtScore(top.overall) : 'unavailable'}.
      </p>
      <ol
        className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4 p-0 md:gap-6"
        aria-label={`Rotations for ${fieldId}, best first`}
      >
        {rotations.map((r) => (
          <RotationTile
            key={r.rotation_id}
            r={r}
            expanded={expandedId === r.rotation_id}
            hasDetail={!!renderDetail}
            detailId={detailId}
            onToggle={() => setOpen(expandedId === r.rotation_id ? null : { fieldId, id: r.rotation_id })}
          />
        ))}
      </ol>
      {renderDetail && (
        <div id={detailId} ref={detailRef} className="mt-4 md:mt-6" aria-label="Rotation details">
          {expanded && renderDetail(expanded)}
        </div>
      )}
    </section>
  )
}
