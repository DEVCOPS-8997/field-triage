import { useId, type CSSProperties } from 'react'
import { FlaskConical } from 'lucide-react'
import { cx, fg, tabular, type } from './cls'

type Tone = 'accent' | 'water' | 'soil' | 'resilience' | 'income' | 'simulated'

const TONE_COLOR: Record<Tone, string> = {
  accent: 'var(--color-accent, #4ade80)',
  water: 'var(--color-water, #38bdf8)',
  soil: 'var(--color-soil, #e9965f)',
  resilience: 'var(--color-resilience, #2dd4bf)',
  income: 'var(--color-income, #bef264)',
  simulated: 'var(--color-demo, #fbbf24)',
}

// Native range styling (02-UI-SPEC Slider): 44px hit area, 8px track, 24px thumb
// with a 3px tone ring, growing to 28px on hover/press. `simulated` = amber
// diagonal stripes + dashed boundary. React 19 hoists and dedupes this <style>.
const SLIDER_CSS = `
.ui4-range{-webkit-appearance:none;appearance:none;width:100%;height:44px;margin:0;background:transparent;cursor:pointer;touch-action:pan-y}
.ui4-range:disabled{opacity:.5;cursor:not-allowed}
.ui4-range::-webkit-slider-runnable-track{height:8px;border-radius:9999px;border:1px solid var(--color-control-border,rgba(190,242,220,.45));
  background:linear-gradient(to right,var(--tone) 0 var(--fill),rgba(255,255,255,.14) var(--fill) 100%)}
.ui4-range::-moz-range-track{height:8px;border-radius:9999px;border:1px solid var(--color-control-border,rgba(190,242,220,.45));background:rgba(255,255,255,.14)}
.ui4-range::-moz-range-progress{height:8px;border-radius:9999px;background:var(--tone)}
.ui4-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;margin-top:-9px;border-radius:9999px;background:var(--color-fg,#ecfdf3);
  box-shadow:0 0 0 3px var(--tone),0 2px 8px rgba(0,0,0,.4);transition:transform .15s}
.ui4-range::-moz-range-thumb{width:24px;height:24px;border:0;border-radius:9999px;background:var(--color-fg,#ecfdf3);box-shadow:0 0 0 3px var(--tone),0 2px 8px rgba(0,0,0,.4);transition:transform .15s}
.ui4-range:hover::-webkit-slider-thumb,.ui4-range:active::-webkit-slider-thumb{transform:scale(1.1667)}
.ui4-range:hover::-moz-range-thumb,.ui4-range:active::-moz-range-thumb{transform:scale(1.1667)}
.ui4-range:focus-visible{outline:3px solid var(--color-lime,#bef264);outline-offset:2px;border-radius:12px}
.ui4-range[data-tone=simulated]::-webkit-slider-runnable-track{border-style:dashed;
  background:repeating-linear-gradient(45deg,var(--tone) 0 5px,rgba(251,191,36,.55) 5px 10px) 0 0/var(--fill) 100% no-repeat,rgba(255,255,255,.14)}
.ui4-range[data-tone=simulated]::-moz-range-track{border-style:dashed}
.ui4-range[data-tone=simulated]::-moz-range-progress{background:repeating-linear-gradient(45deg,var(--tone) 0 5px,rgba(251,191,36,.55) 5px 10px)}
@media (prefers-reduced-motion:reduce){.ui4-range::-webkit-slider-thumb,.ui4-range::-moz-range-thumb{transition:none}}
@media (forced-colors:active){.ui4-range::-webkit-slider-runnable-track,.ui4-range::-moz-range-track{border-color:CanvasText}}
`

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  tone?: Tone
  format?: (v: number) => string
  valueText?: (v: number) => string
  helperText?: string
  disabled?: boolean
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  tone = 'accent',
  format = (v) => String(v),
  valueText,
  helperText,
  disabled,
}: SliderProps) {
  const id = useId()
  const helpId = `${id}-help`
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100
  const style = { '--fill': `${pct}%`, '--tone': TONE_COLOR[tone] } as CSSProperties
  const shown = format(value)
  return (
    <div className="flex flex-col gap-1">
      <style href="ui4-slider" precedence="default">
        {SLIDER_CSS}
      </style>
      <div className={cx('flex items-center justify-between gap-2', type.label)}>
        <label htmlFor={id} className={cx('inline-flex items-center gap-2 font-semibold', fg.fg)}>
          {tone === 'simulated' && (
            <FlaskConical size={16} aria-hidden="true" className={fg.demo} />
          )}
          {label}
        </label>
        <output htmlFor={id} className={cx('font-semibold', fg.fg, tabular)}>
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="ui4-range"
        data-tone={tone}
        style={style}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText ? valueText(value) : shown}
        aria-describedby={helperText ? helpId : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {helperText && (
        <p id={helpId} className={cx(type.label, 'font-normal', fg.fg3)}>
          {helperText}
        </p>
      )}
    </div>
  )
}
