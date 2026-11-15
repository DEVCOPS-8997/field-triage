/**
 * Gauge: 270 degree score ring (opening at the bottom), 0-100.
 *
 * Props
 * - value: number | null          null renders a dashed track + CircleSlash + caption "unavailable" (never 0)
 * - size?: 'sm' | 'md' | 'lg'     72 / 120 / 176 px (default 'md')
 * - tone?: 'accent' | 'water' | 'soil' | 'resilience' | 'income'   accent = lime-to-green gradient
 * - label?: string                shown under the number (md, lg) and used in the aria-label
 * - caption?: ReactNode           Label text below the ring
 * No red / amber / green bands: scoring parameters are illustrative.
 */
import { useEffect, useId, useState, type ReactNode } from 'react'
import { CircleSlash } from 'lucide-react'
import { cn, TONE_COLOR, type ScoreTone } from './cn'
import { useI18n } from '../../lib/i18n'

export interface GaugeProps {
  value: number | null
  size?: 'sm' | 'md' | 'lg'
  tone?: ScoreTone
  label?: string
  caption?: ReactNode
  className?: string
}

const DIM = { sm: 72, md: 120, lg: 176 } as const
const STROKE = { sm: 8, md: 12, lg: 16 } as const
const VALUE_CLS = { sm: 'text-body', md: 'text-heading', lg: 'text-display' } as const

export function Gauge({ value, size = 'md', tone = 'accent', label, caption, className }: GaugeProps) {
  const { t } = useI18n()
  const gradId = `fsa-g-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const px = DIM[size]
  const sw = STROKE[size]
  const r = (px - sw) / 2
  // 270 degree arc: from 135deg to 45deg (clockwise, screen coordinates), opening at the bottom
  const cx = px / 2
  const pt = (deg: number) => {
    const rad = (deg * Math.PI) / 180
    return `${(cx + r * Math.cos(rad)).toFixed(2)} ${(cx + r * Math.sin(rad)).toFixed(2)}`
  }
  const d = `M ${pt(135)} A ${r} ${r} 0 1 1 ${pt(45)}`
  const unavailable = value === null || Number.isNaN(value)
  const clamped = unavailable ? 0 : Math.min(100, Math.max(0, value))

  // animate from empty on mount (CSS transition; disabled under reduced motion)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(clamped))
    return () => cancelAnimationFrame(raf)
  }, [clamped])

  const stroke = tone === 'accent' ? `url(#${gradId})` : TONE_COLOR[tone]
  const a11y = unavailable
    ? { role: 'img', 'aria-label': t('common.scoreUnavailable', { label: label ?? t('common.score') }) }
    : {
        role: 'meter',
        'aria-valuenow': Math.round(clamped),
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-label': t('common.scoreOutOf', { label: label ?? t('common.score'), value: Math.round(clamped) }),
      }

  return (
    <figure data-component="Gauge" className={cn('m-0 inline-flex flex-col items-center gap-2', className)} {...a11y}>
      <div className="relative" style={{ width: px, height: px }}>
        <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden>
          <defs>
            <linearGradient id={gradId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#BEF264" />
              <stop offset="100%" stopColor="#4ADE80" />
            </linearGradient>
          </defs>
          <path
            d={d}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={unavailable ? `${sw * 0.5} ${sw}` : undefined}
          />
          {!unavailable && clamped > 0 && (
            <path
              className="fsa-gauge-arc"
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray="100 100"
              strokeDashoffset={100 - shown}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {unavailable ? (
            <CircleSlash size={size === 'sm' ? 16 : 24} strokeWidth={1.75} aria-hidden className="text-fg-3" />
          ) : (
            <span className={cn('font-display font-semibold tabular-nums text-fg', VALUE_CLS[size])}>
              {Math.round(clamped)}
            </span>
          )}
          {label && size !== 'sm' && <span className="text-label font-normal text-fg-2">{label}</span>}
        </div>
      </div>
      {(caption || unavailable) && (
        <figcaption className="text-label font-normal text-fg-2">{unavailable ? t('common.unavailable') : caption}</figcaption>
      )}
    </figure>
  )
}

export default Gauge
