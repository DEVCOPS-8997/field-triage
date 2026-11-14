import { CircleSlash, FlaskConical, Satellite, Sigma, type LucideIcon } from 'lucide-react'
import type { Quality } from '../types/api'
import { cn } from './ui/cn'
import { Skeleton } from './ui/Skeleton'

// Each state differs by icon, border style AND fill, so the four are distinguishable
// without colour (greyscale, colour-blind users). Text is the data value verbatim.
const STATES: Record<Quality, { Icon: LucideIcon; cls: string; title: string }> = {
  observed: {
    Icon: Satellite,
    cls: 'text-observed border-solid border-observed/70 bg-observed/14',
    title: 'Measured by a satellite or sensor',
  },
  derived: {
    Icon: Sigma,
    cls: 'text-derived border-solid border-derived/80 bg-transparent',
    title: 'Calculated from observed data',
  },
  demo: {
    Icon: FlaskConical,
    cls: 'text-demo border-dashed border-demo/80 bg-demo/14',
    title: 'Synthetic demo data, not a measurement',
  },
  unavailable: {
    Icon: CircleSlash,
    cls: 'text-unavailable border-dotted border-unavailable/80 hatch-unavailable',
    title: 'No data for this value',
  },
}

interface Props {
  quality: Quality
  loading?: boolean
  className?: string
}

export default function DataQualityBadge({ quality, loading = false, className }: Props) {
  if (loading) return <Skeleton preset="pill" />
  const s = STATES[quality] ?? STATES.unavailable
  const Icon = s.Icon
  return (
    <span
      data-component="DataQualityBadge"
      data-quality={quality}
      title={s.title}
      className={cn(
        'inline-flex h-[28px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-label font-semibold lowercase',
        s.cls,
        className,
      )}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
      {quality}
    </span>
  )
}
