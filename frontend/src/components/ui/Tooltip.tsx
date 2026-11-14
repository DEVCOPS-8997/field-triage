/**
 * Tooltip: small glass label shown next to a trigger.
 * Appears after 300ms on hover, immediately on keyboard focus, hides on Esc / leave / blur.
 * Never the only carrier of essential information (the trigger keeps its own aria-label).
 *
 * Props
 * - content: ReactNode                               tooltip text
 * - side?: 'top' | 'right' | 'bottom' | 'left'       default 'top'
 * - children: ReactNode                              the trigger (one focusable element)
 * - className?: string                               classes for the wrapper span
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from './cn'

export interface TooltipProps {
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactNode
  className?: string
}

const SIDE: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
}

export function Tooltip({ content, side = 'top', children, className }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const show = (delay: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    window.clearTimeout(timer.current)
    setOpen(false)
  }

  return (
    <span
      data-component="Tooltip"
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => show(300)}
      onMouseLeave={hide}
      onFocus={(e) => {
        // keyboard focus only: :focus-visible is not set on mouse clicks of buttons
        if ((e.target as HTMLElement).matches?.(':focus-visible')) show(0)
      }}
      onBlur={hide}
      onPointerDown={hide}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'glass-strong pointer-events-none absolute z-[1200] whitespace-nowrap rounded-[var(--radius-chip)] p-2 text-label font-semibold text-fg',
            SIDE[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}

export default Tooltip
