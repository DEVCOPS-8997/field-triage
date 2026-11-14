import { color, fmtScore, text } from './tokens'

type Props = {
  low: number | null | undefined
  high: number | null | undefined
  value?: number | null
  label?: string
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const pct = (v: number) => `${Math.min(100, Math.max(0, v))}%`

/** Uncertainty range bar on a 0-100 scale: band = low..high, tick = overall. */
export function RangeBar({ low, high, value, label = 'Uncertainty range' }: Props) {
  const ok = isNum(low) && isNum(high)
  const lo = ok ? Math.min(low, high) : 0
  const hi = ok ? Math.max(low, high) : 0
  const ariaLabel = ok
    ? `${label}: ${fmtScore(lo)} to ${fmtScore(hi)} out of 100${isNum(value) ? `, overall ${fmtScore(value)}` : ''}`
    : `${label}: unavailable`

  return (
    <div data-component="RangeBar" className="flex flex-col gap-1">
      <div className={`flex items-baseline justify-between gap-2 ${text.label}`}>
        <span className="font-semibold" style={{ color: color.fg2 }}>
          {label}
        </span>
        <span className="tabular-nums" style={{ color: ok ? color.fg : color.fg3 }}>
          {ok ? `${fmtScore(lo)} – ${fmtScore(hi)}` : 'unavailable'}
        </span>
      </div>
      <div role="img" aria-label={ariaLabel} className="relative h-4">
        {/* 0-100 track */}
        <div
          className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full border"
          style={{
            background: 'rgba(255,255,255,0.08)',
            borderColor: color.glassBorder,
            borderStyle: ok ? 'solid' : 'dotted',
          }}
        />
        {ok && (
          <div
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full motion-safe:transition-all motion-safe:duration-[250ms]"
            style={{
              left: pct(lo),
              width: `max(4px, ${hi - lo}%)`,
              background: `color-mix(in srgb, ${color.accent} 45%, transparent)`,
              border: `1px solid ${color.accent}`,
            }}
          />
        )}
        {ok && isNum(value) && (
          <div
            className="absolute top-0 h-4 w-1 -translate-x-1/2 rounded-full motion-safe:transition-all motion-safe:duration-[250ms]"
            style={{ left: pct(value), background: color.fg }}
          />
        )}
      </div>
    </div>
  )
}

export default RangeBar
