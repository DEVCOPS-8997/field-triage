import { CircleSlash, FlaskConical, Satellite, Sigma, type LucideIcon } from 'lucide-react'
import type { Quality } from '../types/api'
import { cn } from './ui/cn'
import { Skeleton } from './ui/Skeleton'
import { useI18n, type TranslationKey } from '../lib/i18n'

// Each state differs by icon, border style AND fill, so the four are distinguishable
// without colour (greyscale, colour-blind users). Text is the data value verbatim in English;
// in Urdu it is translated and the English term stays in the tooltip.
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
  const { lang, t } = useI18n()
  if (loading) return <Skeleton preset="pill" />
  const known = quality in STATES ? quality : 'unavailable'
  const s = STATES[known]
  const label = lang === 'en' ? quality : t(`quality.${known}` as TranslationKey)
  const title = lang === 'en' ? s.title : t(`quality.${known}Title` as TranslationKey)
  const Icon = s.Icon
  return (
    <span
      data-component="DataQualityBadge"
      data-quality={quality}
      title={title}
      className={cn(
        'inline-flex h-[28px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-label font-semibold lowercase',
        s.cls,
        className,
      )}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
      {label}
    </span>
  )
}
