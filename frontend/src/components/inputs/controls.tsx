import { useEffect, useId, useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { parseAmount } from '../../lib/units'
import { cx, fg, surface, tabular, type } from '../../lib/ui4/cls'
import { controlCls, hintCls } from './styles'

/** One question in the inputs panel: a disclosure whose closed state shows the current answer. */
export function InputSection({
  icon: Icon,
  title,
  answer,
  defaultOpen = false,
  children,
}: {
  icon: LucideIcon
  title: string
  answer: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className={cx(surface.flat, 'flex flex-col')}>
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-[52px] w-full items-center gap-3 rounded-[var(--radius-control,1rem)] px-3 py-2 text-left hover:bg-[rgba(255,255,255,0.05)]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(74,222,128,0.14)] text-[color:var(--color-accent,#4ade80)]">
            <Icon size={16} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cx('font-semibold', type.label, fg.fg)}>{title}</span>
            <span className={cx('truncate text-[13px]', fg.fg2)}>{answer}</span>
          </span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={cx('shrink-0 motion-safe:transition-transform motion-safe:duration-150', fg.fg3, open && 'rotate-180')}
          />
        </button>
      </h3>
      <div id={`${id}-panel`} hidden={!open} className="flex flex-col gap-3 px-3 pb-3 pt-1">
        {children}
      </div>
    </div>
  )
}

/** Radio buttons drawn as wrapping pills (keyboard: arrow keys move between options). */
export function ChoiceGroup<T extends string | number>({
  legend,
  value,
  options,
  onChange,
  srLegend = false,
}: {
  legend: string
  value: T
  options: { v: T; label: ReactNode }[]
  onChange: (v: T) => void
  srLegend?: boolean
}) {
  const name = useId()
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className={cx('mb-2 p-0', type.label, fg.fg2, srLegend && 'sr-only')}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = o.v === value
          return (
            <label
              key={String(o.v)}
              className={cx(
                'relative inline-flex min-h-[40px] cursor-pointer items-center rounded-full border px-3 font-semibold',
                type.label,
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[color:var(--color-accent,#4ade80)]',
                checked
                  ? 'border-[color:var(--color-accent,#4ade80)] bg-[rgba(74,222,128,0.18)] text-[color:var(--color-fg,#ecfdf3)]'
                  : 'border-[color:var(--color-glass-border,rgba(190,242,220,0.25))] text-[color:var(--color-fg-2,#b4cfc0)] hover:bg-[rgba(255,255,255,0.06)]',
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={checked}
                onChange={() => onChange(o.v)}
              />
              {o.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Number box that accepts free typing and reports a parsed value (empty = null, never 0). */
export function NumberInput({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  hint,
  srLabel = false,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  suffix?: string
  placeholder?: string
  hint?: ReactNode
  srLabel?: boolean
}) {
  const id = useId()
  const [text, setText] = useState(value === null ? '' : String(value))
  useEffect(() => {
    if (parseAmount(text) !== value) setText(value === null ? '' : String(value))
    // Only react to outside changes of `value`, not to typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={cx(type.label, fg.fg2, srLabel && 'sr-only')}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={cx(controlCls, tabular, suffix && 'pr-16')}
          value={text}
          placeholder={placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            setText(e.target.value)
            onChange(parseAmount(e.target.value))
          }}
        />
        {suffix && (
          <span className={cx('pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px]', fg.fg3)}>
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className={hintCls}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function SelectInput<T extends string>({
  label,
  value,
  options,
  onChange,
  srLabel = false,
}: {
  label: string
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
  srLabel?: boolean
}) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={cx(type.label, fg.fg2, srLabel && 'sr-only')}>
        {label}
      </label>
      <select id={id} className={controlCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Live result of a conversion ("= 310 mm over your 2.5-acre field"). */
export function ConversionLine({ children, tone = 'ok' }: { children: ReactNode; tone?: 'ok' | 'warn' }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cx(
        'm-0 rounded-xl px-3 py-2 text-[14px] font-semibold',
        tone === 'ok' ? 'bg-[rgba(74,222,128,0.12)] text-[color:var(--color-accent,#4ade80)]' : 'bg-[rgba(251,191,36,0.12)] text-[color:var(--color-demo,#fbbf24)]',
      )}
    >
      {children}
    </p>
  )
}
