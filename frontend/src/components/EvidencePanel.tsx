import type { ReactNode } from 'react'
import { CircleSlash } from 'lucide-react'
import type { EvidenceItem } from '../types/api'
import { cx, fg, surface, tabular, type } from '../lib/ui4/cls'

export interface EvidencePanelProps {
  items: EvidenceItem[]
  /** Optional slot, e.g. a DataQualityBadge per evidence item (Phase 5). */
  renderBadge?: (item: EvidenceItem) => ReactNode
  className?: string
}

function formatValue(v: number | string): string {
  if (typeof v === 'string') return v
  return v.toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) < 10 ? 3 : 1 })
}

const COLS = 'md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,2fr)] md:gap-4'

function Cell({ heading, children, className }: { heading: string; children: ReactNode; className?: string }) {
  return (
    <div role="cell" className={cx('flex min-w-0 flex-col gap-0.5', className)}>
      <span className={cx(type.label, 'font-normal md:sr-only', fg.fg3)}>{heading}</span>
      {children}
    </div>
  )
}

export default function EvidencePanel({ items, renderBadge, className }: EvidencePanelProps) {
  if (items.length === 0) {
    return (
      <p data-component="EvidencePanel" className={cx(type.body, fg.fg3, className)}>
        No evidence reported
      </p>
    )
  }
  return (
    <div data-component="EvidencePanel" role="table" aria-label="Evidence" className={cx('flex flex-col gap-2', className)}>
      <div role="rowgroup" className="hidden md:block">
        <div role="row" className={cx(COLS, 'px-4', type.label, 'font-semibold', fg.fg3)}>
          <span role="columnheader">Variable</span>
          <span role="columnheader">Value</span>
          <span role="columnheader">Source</span>
          <span role="columnheader">Interpretation</span>
        </div>
      </div>
      <ul role="rowgroup" className="flex flex-col gap-2">
        {items.map((item, i) => {
          const missing = item.value === null || item.value === undefined || item.value === ''
          return (
            <li
              key={`${item.variable}-${i}`}
              role="row"
              className={cx(surface.flat, 'flex flex-col gap-2 p-4', COLS, fg.fg)}
            >
              <Cell heading="Variable">
                <span className={cx(type.label, 'font-semibold break-words')}>{item.variable}</span>
              </Cell>
              <Cell heading="Value">
                {missing ? (
                  <span className={cx('inline-flex items-center gap-1', type.label, fg.fg3)}>
                    <CircleSlash size={16} aria-hidden="true" />
                    No observation
                  </span>
                ) : (
                  <span className={cx(type.body, 'font-semibold', tabular)}>
                    {formatValue(item.value as number | string)}
                    {item.unit && <span className={cx(type.label, 'font-normal', fg.fg2)}> {item.unit}</span>}
                  </span>
                )}
              </Cell>
              <Cell heading="Source">
                <span className={cx('flex flex-wrap items-center gap-2', type.label, 'font-normal', fg.fg2)}>
                  {item.source || 'Source not stated'}
                  {renderBadge?.(item)}
                </span>
              </Cell>
              <Cell heading="Interpretation">
                <span className={cx(type.label, 'font-normal', fg.fg2)}>
                  {item.interpretation || 'No interpretation given'}
                </span>
              </Cell>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
