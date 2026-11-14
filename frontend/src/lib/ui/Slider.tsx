import { useId, type KeyboardEvent } from 'react'
import { type Tone, color, text, toneColor } from './tokens'

type Props = {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  /** Page Up / Page Down step (native default is browser-defined). */
  pageStep?: number
  onChange: (v: number) => void
  tone?: Tone
  format?: (v: number) => string
  disabled?: boolean
  helperText?: string
  valueText?: string
}

/**
 * Spec Slider: native <input type="range"> (keyboard, screen reader and touch
 * for free) laid transparently over a styled 44px control row.
 */
export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  pageStep,
  onChange,
  tone = 'accent',
  format = (v) => v.toFixed(2),
  disabled = false,
  helperText,
  valueText,
}: Props) {
  const id = useId()
  const helpId = `${id}-help`
  const span = max - min || 1
  const p = Math.min(1, Math.max(0, (value - min) / span))
  const fill = toneColor[tone]

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!pageStep || (e.key !== 'PageUp' && e.key !== 'PageDown')) return
    e.preventDefault()
    const next = value + (e.key === 'PageUp' ? pageStep : -pageStep)
    onChange(Math.min(max, Math.max(min, Math.round(next / step) * step)))
  }

  return (
    <div data-component="Slider" data-tone={tone} className={disabled ? 'opacity-50' : undefined}>
      <div className={`flex items-baseline justify-between gap-2 ${text.label}`}>
        <label htmlFor={id} className="font-semibold" style={{ color: color.fg }}>
          {label}
        </label>
        <output htmlFor={id} className="tabular-nums" style={{ color: color.fg }}>
          {format(value)}
        </output>
      </div>
      <div className="group relative mt-2 h-[44px] rounded-full has-[input:focus-visible]:outline-[3px] has-[input:focus-visible]:outline-solid has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-[color:var(--color-lime,#bef264)]">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full border"
          style={{ background: 'rgba(255,255,255,0.14)', borderColor: color.controlBorder }}
        >
          <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: fill }} />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 size-[24px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.4)] motion-safe:transition-[width,height] motion-safe:duration-150 group-hover:size-[28px] group-active:size-[28px]"
          style={{ left: `calc(12px + (100% - 24px) * ${p})`, background: color.fg, borderColor: fill }}
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          onKeyDown={onKeyDown}
          aria-valuetext={valueText ?? format(value)}
          aria-describedby={helperText ? helpId : undefined}
          className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
      {helperText && (
        <p id={helpId} className={`m-0 ${text.label}`} style={{ color: color.fg3 }}>
          {helperText}
        </p>
      )}
    </div>
  )
}

export default Slider
