/**
 * Skeleton: loading placeholder with a 1.4s shimmer (static under reduced motion).
 *
 * Props
 * - preset?: 'row' | 'tile' | 'pill' | 'block'   row = h 72, tile = h 96, pill = 80 x 28, block = size via className
 * - className?: string                           extra sizing classes
 * Always aria-hidden; pair with screen-reader text (e.g. <span className="sr-only">Loading fields</span>).
 */
import { cn } from './cn'

export interface SkeletonProps {
  preset?: 'row' | 'tile' | 'pill' | 'block'
  className?: string
}

const PRESET = {
  row: 'h-[72px] w-full rounded-[var(--radius-control)]',
  tile: 'h-[96px] w-full rounded-[var(--radius-control)]',
  pill: 'h-[28px] w-[80px] rounded-full',
  block: 'rounded-[var(--radius-control)]',
} as const

export function Skeleton({ preset = 'block', className }: SkeletonProps) {
  return <span data-component="Skeleton" aria-hidden className={cn('skeleton block', PRESET[preset], className)} />
}

export default Skeleton
