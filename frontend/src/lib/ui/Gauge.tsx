import { useId } from 'react'
import { CircleSlash } from 'lucide-react'
import { type Tone, color, fmtScore, text, toneColor } from './tokens'

type Props = {
  value: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
  tone?: Tone
  label?: string
  caption?: string
}

const dims = { sm: { px: 72, stroke: 8 }, md: { px: 120, stroke: 12 }, lg: { px: 176, stroke: 16 } }
const valueClass = {
  sm: `${text.body} font-semibold font-[family-name:var(--font-display,Fraunces,Georgia,serif)]`,
  md: text.heading,
  lg: text.display,
}

/** Spec Gauge: 270 degree score ring opening at the bottom; null = unavailable. */
export function Gauge({ value, size = 'md', tone = 'accent', label = 'Score', caption }: Props) {
  const gid = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const { px, stroke } = dims[size]
  const r = (px - stroke) / 2
  const c = px / 2
  const k = Math.SQRT1_2 * r
  // Start at 135 degrees (bottom-left), sweep 270 degrees clockwise to 45 degrees.
  const d = `M ${c - k} ${c + k} A ${r} ${r} 0 1 1 ${c + k} ${c + k}`
  const has = typeof value === 'number' && Number.isFinite(value)
  const v = has ? Math.min(100, Math.max(0, value)) : 0

  return (
    <figure data-component="Gauge" className="m-0 inline-flex flex-col items-center gap-1">
      <div
        className="relative"
        style={{ width: px, height: px }}
        role={has ? 'meter' : 'img'}
        aria-valuenow={has ? v : undefined}
        aria-valuemin={has ? 0 : undefined}
        aria-valuemax={has ? 100 : undefined}
        aria-label={has ? `${label}: ${fmtScore(v)} out of 100` : `${label}: unavailable`}
      >
        <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden="true">
          <defs>
            <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#bef264" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>
          </defs>
          <path
            d={d}
            pathLength={100}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={stroke}
            strokeLinecap={has ? 'round' : 'butt'}
            strokeDasharray={has ? undefined : '2 3'}
          />
          {has && v > 0 && (
            <path
              d={d}
              pathLength={100}
              fill="none"
              stroke={tone === 'accent' ? `url(#${gid})` : toneColor[tone]}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${v} 100`}
              className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-[600ms] motion-safe:ease-out"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center tabular-nums">
          {has ? (
            <>
              <span className={valueClass[size]} style={{ color: color.fg }}>
                {fmtScore(v)}
              </span>
              {size !== 'sm' && label && (
                <span className={text.label} style={{ color: color.fg2 }}>
                  {label}
                </span>
              )}
            </>
          ) : (
            <CircleSlash size={size === 'sm' ? 16 : 24} strokeWidth={1.75} style={{ color: color.fg3 }} />
          )}
        </div>
      </div>
      {(caption || !has) && (
        <figcaption className={text.label} style={{ color: color.fg2 }}>
          {has ? caption : 'unavailable'}
        </figcaption>
      )}
    </figure>
  )
}

export default Gauge
