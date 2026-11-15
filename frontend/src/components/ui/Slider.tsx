/**
 * Slider: labelled native <input type="range"> with a tone-coloured fill.
 *
 * Slider props
 * - label: string                     visible label (also the input's accessible name)
 * - value: number; min?: number (0); max?: number (1); step?: number (0.01)
 * - onChange: (value: number) => void
 * - tone?: 'accent' | 'water' | 'soil' | 'resilience' | 'income' | 'simulated'   default 'accent'
 *     'simulated' = striped amber fill, dashed boundary, FlaskConical icon. It must sit beneath the
 *     verbatim label "Simulated conditions, not a NASA forecast" (use <SimulatedLabel/>).
 * - format?: (v: number) => string    readout + aria-valuetext (default: v.toFixed(2))
 * - valueText?: string                overrides aria-valuetext
 * - helperText?: ReactNode            Label 400 fg-3 line under the control
 * - pageStep?: number                 PageUp / PageDown step (e.g. 0.05 for priority weights)
 * - disabled?: boolean, id?: string, className?: string
 *
 * Sum-to-1 priority variant (visual contract; rebalance logic lives in Phase 3):
 *   <SumToOneSliders items={[{ id:'w_water', label:'Water', tone:'water', value:0.25 }, ...]}
 *                    onChange={(id, v) => ...} />
 * renders an <AllocationBar/>, a "Total 1.00" accent Badge, and four Sliders with step 0.01,
 * range 0-1, two-decimal readouts and PageUp/PageDown = 0.05.
 */
import { useId, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Check, FlaskConical } from 'lucide-react'
import { cn, TONE_COLOR, type ScoreTone } from './cn'
import { Badge } from './Badge'
import { Ltr } from './Ltr'
import { useI18n } from '../../lib/i18n'

export type SliderTone = ScoreTone | 'simulated'

export interface SliderProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  tone?: SliderTone
  format?: (v: number) => string
  valueText?: string
  helperText?: ReactNode
  pageStep?: number
  disabled?: boolean
  id?: string
  className?: string
}

const defaultFormat = (v: number) => v.toFixed(2)

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  tone = 'accent',
  format = defaultFormat,
  valueText,
  helperText,
  pageStep,
  disabled = false,
  id,
  className,
}: SliderProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const helpId = `${inputId}-help`
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100
  const style = { '--fill': `${pct}%`, '--tone': TONE_COLOR[tone] } as CSSProperties

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!pageStep) return
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const dir = e.key === 'PageUp' ? 1 : -1
      const next = Math.min(max, Math.max(min, value + dir * pageStep))
      onChange(Number(next.toFixed(6)))
    }
  }

  return (
    <div data-component="Slider" data-tone={tone} className={cn('min-w-0', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="flex min-w-0 items-center gap-1 text-label font-semibold text-fg">
          {tone === 'simulated' && <FlaskConical size={16} strokeWidth={1.75} aria-hidden className="text-demo" />}
          {tone !== 'simulated' && tone !== 'accent' && (
            <span aria-hidden className="size-[8px] shrink-0 rounded-full" style={{ background: TONE_COLOR[tone] }} />
          )}
          <span className="truncate">{label}</span>
        </label>
        <output htmlFor={inputId} className="text-label font-semibold tabular-nums text-fg">
          <Ltr>{format(value)}</Ltr>
        </output>
      </div>
      <input
        id={inputId}
        type="range"
        className="fsa-range"
        data-tone={tone}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText ?? format(value)}
        aria-describedby={helperText ? helpId : undefined}
        onKeyDown={onKeyDown}
        onChange={(e) => onChange(Number(e.target.value))}
        style={style}
      />
      {helperText && (
        <p id={helpId} className="m-0 text-label font-normal text-fg-3">
          {helperText}
        </p>
      )}
    </div>
  )
}

/** Verbatim scenario label (SCN-02). Place above any `simulated` Slider. */
export function SimulatedLabel({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <p className={cn('m-0 flex items-center gap-1 text-label font-semibold text-demo', className)}>
      <FlaskConical size={16} strokeWidth={1.75} aria-hidden />
      {t('slider.simulated')}
    </p>
  )
}

export interface AllocationItem {
  id: string
  label: string
  tone: ScoreTone
  value: number
}

/** AllocationBar: 12px segmented pill, segment widths = weights (should sum to 1). */
export function AllocationBar({ items, className }: { items: AllocationItem[]; className?: string }) {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0) || 1
  return (
    <div
      data-component="AllocationBar"
      role="img"
      aria-label={items.map((i) => `${i.label} ${i.value.toFixed(2)}`).join(', ')}
      className={cn('flex h-[12px] w-full gap-[2px] overflow-hidden rounded-full', className)}
    >
      {items.map((i) => (
        <span
          key={i.id}
          className="h-full rounded-full transition-[flex-grow] duration-[250ms] ease-[var(--ease-out-soft)]"
          style={{ flexGrow: Math.max(0, i.value) / total, flexBasis: 0, background: TONE_COLOR[i.tone] }}
        />
      ))}
    </div>
  )
}

export interface SumToOneSlidersProps {
  items: AllocationItem[]
  onChange: (id: string, value: number) => void
  className?: string
}

/** Sum-to-1 priority group. The parent owns rebalancing; the total chip always reads 1.00. */
export function SumToOneSliders({ items, onChange, className }: SumToOneSlidersProps) {
  const { t } = useI18n()
  return (
    <div data-component="SumToOneSliders" className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-center gap-2">
        <AllocationBar items={items} className="flex-1" />
        <Badge tone="accent" icon={Check}>
          {t('common.total', { value: '1.00' })}
        </Badge>
      </div>
      {items.map((i) => (
        <Slider
          key={i.id}
          label={i.label}
          tone={i.tone}
          value={i.value}
          min={0}
          max={1}
          step={0.01}
          pageStep={0.05}
          onChange={(v) => onChange(i.id, v)}
        />
      ))}
    </div>
  )
}

export default Slider
