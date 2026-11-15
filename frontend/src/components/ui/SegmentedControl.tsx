/**
 * SegmentedControl: pill radiogroup (e.g. Map | Satellite).
 * Roving tabindex; Left/Right/Up/Down move and select (Left/Right follow the reading direction); Home/End jump.
 *
 * Props
 * - label: string                               aria-label of the group (e.g. "Map style")
 * - options: { value: T; label: string }[]      text-only options
 * - value: T                                    selected value
 * - onChange: (value: T) => void
 * - className?: string
 */
import { useRef, type KeyboardEvent } from 'react'
import { cn } from './cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  label: string
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  const move = (idx: number) => {
    const n = options.length
    const next = ((idx % n) + n) % n
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // In RTL the options run right to left, so ArrowLeft means "next".
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight'
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'
    switch (e.key) {
      case fwd:
      case 'ArrowDown':
        e.preventDefault()
        move(current + 1)
        break
      case back:
      case 'ArrowUp':
        e.preventDefault()
        move(current - 1)
        break
      case 'Home':
        e.preventDefault()
        move(0)
        break
      case 'End':
        e.preventDefault()
        move(options.length - 1)
        break
    }
  }

  return (
    <div
      data-component="SegmentedControl"
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'glass-strong inline-flex shrink-0 items-stretch rounded-full border-control-border! p-1',
        className,
      )}
    >
      {options.map((o, i) => {
        const checked = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-[36px] min-w-[88px] rounded-full px-4 text-label font-semibold transition-colors duration-150',
              checked
                ? 'bg-accent text-accent-ink shadow-[0_0_16px_rgba(74,222,128,0.35)]'
                : 'text-fg-2 hover:text-fg',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default SegmentedControl
