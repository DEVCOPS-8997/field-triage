import {
  Bug,
  ChevronDown,
  CloudSun,
  Coins,
  Database,
  Droplets,
  ExternalLink,
  Layers,
  Leaf,
  Mountain,
  Snowflake,
  Sprout,
  ThermometerSun,
  Tractor,
  type LucideIcon,
} from 'lucide-react'
import type { Insight, InsightKind } from '../../types/api'
import { cx, fg, type } from '../../lib/ui4/cls'

const TOPIC_ICON: Record<string, LucideIcon> = {
  water: Droplets,
  heat: ThermometerSun,
  frost: Snowflake,
  nitrogen: Sprout,
  cover: Leaf,
  pest: Bug,
  income: Coins,
  soil: Layers,
  terrain: Mountain,
  climate: CloudSun,
  data: Database,
  farm: Tractor,
}

export const KIND_STYLE: Record<InsightKind, { accent: string; chip: string; label: string }> = {
  benefit: { accent: '#2dd4bf', chip: 'bg-[rgba(45,212,191,0.16)] text-[#5eead4]', label: 'Benefit' },
  risk: { accent: '#fda4af', chip: 'bg-[rgba(253,164,175,0.16)] text-[#fda4af]', label: 'Risk' },
  gap: { accent: '#fbbf24', chip: 'bg-[rgba(251,191,36,0.16)] text-[#fcd34d]', label: 'Data gap' },
  check: { accent: '#c4b5fd', chip: 'bg-[rgba(196,181,253,0.16)] text-[#c4b5fd]', label: 'Check' },
}

/** Source line: authority name, linked when a verified URL exists. Wraps instead of clipping. */
export function SourceChip({ source, url }: { source?: string | null; url?: string | null }) {
  if (!source) return null
  const body = (
    <>
      <span className={cx('shrink-0 font-semibold uppercase tracking-[0.06em]', fg.fg3)}>Source</span>
      <span className="min-w-0 break-words">{source}</span>
      {url && <ExternalLink size={12} aria-hidden="true" className="mt-[3px] shrink-0" />}
    </>
  )
  const cls = cx(
    'inline-flex max-w-full items-start gap-1.5 rounded-lg bg-[rgba(0,0,0,0.22)] px-2 py-1 text-[12px] leading-snug',
    fg.fg2,
  )
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className={cx(cls, 'hover:text-[color:var(--color-fg,#ecfdf3)] hover:underline')}>
      {body}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  ) : (
    <span className={cls}>{body}</span>
  )
}

/**
 * One finding as a disclosure row: topic icon, plain headline and a one-line preview when closed;
 * the full explanation and its source when open. Native <details> keeps it keyboard and
 * screen-reader friendly with no extra state.
 */
export function InsightRow({ insight, defaultOpen = false }: { insight: Insight; defaultOpen?: boolean }) {
  const Icon = TOPIC_ICON[insight.topic] ?? Database
  const k = KIND_STYLE[insight.kind]
  return (
    <details
      open={defaultOpen}
      className="insight-row group rounded-xl border border-[color:var(--color-glass-border,rgba(190,242,220,0.14))] bg-[rgba(255,255,255,0.03)] open:bg-[rgba(255,255,255,0.06)]"
      style={{ borderLeft: `3px solid ${k.accent}` }}
    >
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', k.chip)}>
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cx('font-semibold leading-snug', type.label, fg.fg)}>{insight.title}</span>
          <span className={cx('truncate text-[12px] group-open:hidden', fg.fg3)}>{insight.detail}</span>
        </span>
        <span className="sr-only">{k.label}</span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={cx('shrink-0 transition-transform motion-safe:duration-200 group-open:rotate-180', fg.fg3)}
        />
      </summary>
      <div className="insight-body flex flex-col gap-2 px-3 pb-3 pl-[56px]">
        <p className={cx('m-0 leading-relaxed', type.label, fg.fg2)}>{insight.detail}</p>
        <SourceChip source={insight.source} url={insight.source_url} />
      </div>
    </details>
  )
}

export function InsightGroup({
  title,
  subtitle,
  items,
  kind,
  empty,
  openFirst = false,
}: {
  title: string
  subtitle?: string
  items: Insight[]
  kind: InsightKind
  empty: string
  openFirst?: boolean
}) {
  const k = KIND_STYLE[kind]
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex items-baseline gap-2">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: k.accent }} />
        <h4 className={cx('m-0 font-semibold', type.body, fg.fg)}>{title}</h4>
        <span className={cx('rounded-full bg-[rgba(255,255,255,0.08)] px-2 text-[12px] tabular-nums', fg.fg2)}>{items.length}</span>
        {subtitle && <span className={cx('ml-auto hidden text-[12px] sm:inline', fg.fg3)}>{subtitle}</span>}
      </header>
      {items.length === 0 ? (
        <p className={cx('m-0 rounded-xl bg-[rgba(255,255,255,0.03)] px-3 py-3', type.label, fg.fg3)}>{empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((i, idx) => (
            <InsightRow key={`${i.topic}-${i.title}`} insight={i} defaultOpen={openFirst && idx === 0} />
          ))}
        </div>
      )}
    </section>
  )
}
