import { useId, useState, type KeyboardEvent } from 'react'
import {
  CircleCheck,
  FileSearch,
  Lightbulb,
  SearchX,
  TriangleAlert,
  UserSearch,
  type LucideIcon,
} from 'lucide-react'
import type { Insight, RotationScore } from '../../types/api'
import EvidenceExplorer from './EvidenceExplorer'
import Term from '../ui/Term'
import { InsightGroup } from './InsightAccordion'
import { Badge } from '../../lib/ui4/primitives'
import { ConfidencePill } from '../../lib/ui/Pill'
import { cx, fg, surface, tabular, type } from '../../lib/ui4/cls'
import { strategyLabel } from './shared'

type TabKey = 'assessment' | 'gaps' | 'evidence'

function ItemList({
  title,
  icon: Icon,
  iconClass,
  items,
  accent,
}: {
  title: string
  icon: LucideIcon
  iconClass: string
  items: string[]
  accent: string
}) {
  return (
    <section className={cx(surface.flat, 'flex min-w-0 flex-col gap-3 border-t-[3px] p-4')} style={{ borderTopColor: accent }}>
      <h4 className={cx('m-0 flex items-center gap-2 font-semibold', type.body, fg.fg)}>
        <Icon size={18} aria-hidden="true" className={iconClass} />
        {title}
        <span className={cx('ml-auto rounded-full bg-[rgba(255,255,255,0.08)] px-2', type.label, fg.fg2, tabular)}>
          {items.length}
        </span>
      </h4>
      {items.length === 0 ? (
        <p className={cx('m-0', type.label, fg.fg3)}>None reported</p>
      ) : (
        <ul className={cx('m-0 flex flex-col gap-2 pl-0', type.label, fg.fg2)}>
          {items.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Headline reasons as a compact strip: first line large, the component changes as chips. */
function WhyStrip({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  const [head, ...rest] = lines
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[linear-gradient(120deg,rgba(74,222,128,0.14),rgba(255,255,255,0.03))] p-4">
      <span className={cx('flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em]', fg.accent)}>
        <Lightbulb size={14} aria-hidden="true" />
        Why this score
      </span>
      <p className={cx('m-0 font-semibold leading-snug', type.body, fg.fg)}>{head}</p>
      {rest.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {rest.map((t) => (
            <li key={t} className={cx('rounded-full bg-[rgba(0,0,0,0.25)] px-3 py-1 text-[13px]', fg.fg2)}>
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One rotation's explanation, split into tabs instead of one tall card. */
export default function RotationDetail({ rotation }: { rotation: RotationScore }) {
  const [tab, setTab] = useState<TabKey>('assessment')
  const base = useId()
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'assessment', label: 'Benefits and risks' },
    { key: 'gaps', label: 'Gaps and farm checks', count: rotation.data_gaps.length + rotation.needs_local_review.length },
    { key: 'evidence', label: 'Evidence', count: rotation.evidence.filter((e) => e.value !== null && e.value !== '').length },
  ]

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.key === tab)
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : -1
    if (next >= 0) {
      e.preventDefault()
      setTab(tabs[next].key)
      document.getElementById(`${base}-tab-${tabs[next].key}`)?.focus()
    }
  }

  const insights = rotation.insights ?? []
  const byKind = (k: Insight['kind']) => insights.filter((i) => i.kind === k)
  const benefits = byKind('benefit')
  const risks = byKind('risk')
  const gaps = byKind('gap')
  const checks = byKind('check')

  return (
    <div className={cx(surface.glass, 'flex flex-col gap-4 p-4 md:p-6')}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className={cx('m-0', type.heading, fg.fg)}>
            #{rotation.rank} {rotation.label}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {rotation.is_existing && <Badge tone="neutral">Your current rotation</Badge>}
            {rotation.shortlist_reason && !rotation.is_existing && <Badge tone="accent">{rotation.shortlist_reason}</Badge>}
            <Badge tone="info">{strategyLabel(rotation.strategy_type)}</Badge>
            <ConfidencePill confidence={rotation.confidence} />
          </div>
        </div>
        <div className="text-right">
          <span className={cx('block text-[32px] leading-none font-semibold', tabular, fg.fg)}>
            {rotation.overall.toFixed(0)}
          </span>
          <span className={cx('inline-flex items-center gap-1', type.label, fg.fg3, tabular)}>
            <Term id="percentile_range">range</Term> {rotation.overall_low.toFixed(0)} to {rotation.overall_high.toFixed(0)}
          </span>
        </div>
      </header>

      {rotation.fits_constraints === false && (rotation.constraint_failures?.length ?? 0) > 0 && (
        <div role="note" className={cx('flex flex-col gap-1 rounded-xl border border-[color:var(--color-danger,#fda4af)] bg-[rgba(253,164,175,0.10)] p-3', type.label, fg.fg2)}>
          <span className={cx('flex items-center gap-2 font-semibold', fg.danger)}>
            <TriangleAlert size={16} aria-hidden="true" />
            Doesn't fit your farm because:
          </span>
          <ul className="m-0 flex flex-col gap-0.5 pl-6">
            {rotation.constraint_failures!.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div
        role="tablist"
        aria-label={`Details for ${rotation.label}`}
        onKeyDown={onKey}
        className="flex gap-1 overflow-x-auto rounded-[var(--radius-control,1rem)] bg-[rgba(0,0,0,0.2)] p-1"
      >
        {tabs.map((t) => {
          const active = t.key === tab
          return (
            <button
              key={t.key}
              id={`${base}-tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={`${base}-panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.key)}
              className={cx(
                'inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-[calc(var(--radius-control,1rem)-4px)] px-3 font-semibold',
                type.label,
                active
                  ? 'bg-[rgba(255,255,255,0.12)] text-[color:var(--color-fg,#ecfdf3)]'
                  : 'text-[color:var(--color-fg-3,#9bbba8)] hover:text-[color:var(--color-fg,#ecfdf3)]',
              )}
            >
              {t.label}
              {t.count !== undefined && <span className={cx('rounded-full bg-[rgba(255,255,255,0.08)] px-1.5', tabular)}>{t.count}</span>}
            </button>
          )
        })}
      </div>

      <div id={`${base}-panel-${tab}`} role="tabpanel" aria-labelledby={`${base}-tab-${tab}`}>
        {tab === 'assessment' && (
          <div className="flex flex-col gap-4">
            <WhyStrip lines={rotation.why} />
            {insights.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <InsightGroup title="What it does well" kind="benefit" items={benefits} empty="No clear benefits found for this spot." openFirst />
                <InsightGroup title="What to watch" kind="risk" items={risks} empty="No risks found in the NASA record for this spot." openFirst />
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <ItemList title="Benefits" icon={CircleCheck} iconClass={fg.accent} items={rotation.benefits} accent="#2dd4bf" />
                <ItemList title="Risks" icon={TriangleAlert} iconClass={fg.danger} items={rotation.risks} accent="#fda4af" />
              </div>
            )}
          </div>
        )}
        {tab === 'gaps' && (
          insights.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <InsightGroup
                title="What we could not see"
                subtitle="Missing or limited data"
                kind="gap"
                items={gaps}
                empty="No data gaps: every source used for this rotation returned values."
              />
              <InsightGroup title="Check on your farm" subtitle="Before you change anything" kind="check" items={checks} empty="Nothing extra to check." />
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <ItemList title="Data gaps" icon={SearchX} iconClass={fg.demo} items={rotation.data_gaps} accent="#fbbf24" />
              <ItemList title="Check locally before acting" icon={UserSearch} iconClass={fg.derived} items={rotation.needs_local_review} accent="#c4b5fd" />
            </div>
          )
        )}
        {tab === 'evidence' && (
          <div className="flex flex-col gap-3">
            <p className={cx('m-0 flex items-center gap-2', type.label, fg.fg3)}>
              <FileSearch size={16} aria-hidden="true" />
              Every number behind this score, grouped, with where it came from.
            </p>
            <EvidenceExplorer items={rotation.evidence.filter((e) => e.value !== null && e.value !== undefined && e.value !== '')} />
          </div>
        )}
      </div>
    </div>
  )
}
