import { useId } from 'react'
import { CalendarDays, Loader2, Satellite } from 'lucide-react'
import type { NdviStatus, RotationScore } from '../../types/api'
import { Badge } from '../../lib/ui4/primitives'
import { cx, fg, surface, type } from '../../lib/ui4/cls'
import FarmYearStrip, { FarmYearLegend } from './FarmYearStrip'

function hasYear(r: RotationScore | undefined): r is RotationScore {
  return !!r && Array.isArray(r.farm_year) && r.farm_year.length === 12
}

function RotationYear({
  rotation,
  tag,
  ndviFallback,
}: {
  rotation: RotationScore
  tag: string
  ndviFallback: (number | null)[] | null
}) {
  const moments = (rotation.key_moments ?? []).filter(Boolean)
  return (
    <section className={cx(surface.flat, 'flex min-w-0 flex-col gap-3 p-3 md:p-4')} aria-label={`${tag}: ${rotation.label}`}>
      <header className="flex flex-wrap items-center gap-2">
        <span className={cx('text-[12px] font-semibold uppercase tracking-[0.08em]', fg.fg3)}>{tag}</span>
        <h4 className={cx('m-0 font-semibold', type.body, fg.fg)}>{rotation.label}</h4>
        {rotation.shortlist_reason && !rotation.is_existing && <Badge tone="accent">{rotation.shortlist_reason}</Badge>}
      </header>
      <FarmYearStrip year={rotation.farm_year!} caption={`Farm year for ${rotation.label}, January to December`} ndviFallback={ndviFallback} />
      {moments.length > 0 && (
        <ul className={cx('m-0 flex flex-col gap-1.5 pl-0', type.label, fg.fg2)}>
          {moments.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-accent,#4ade80)]" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Satellite greenness status: a chip while downloading, a muted line when unavailable. */
export function NdviStatusNote({ status, polling }: { status: NdviStatus | undefined; polling: boolean }) {
  if (!status) return null
  if (polling) {
    return (
      <span role="status" className="inline-flex">
        <Badge tone="info" icon={Loader2}>
          Satellite greenness is downloading…
        </Badge>
      </span>
    )
  }
  if (status.state === 'failed' || status.state === 'not_configured') {
    return (
      <p className={cx('m-0 flex items-center gap-1.5 text-[13px]', fg.fg3)}>
        <Satellite size={14} aria-hidden="true" />
        {status.message || 'Satellite greenness is not available here, so bare months come from crop calendars.'}
      </p>
    )
  }
  return null
}

/**
 * "Your farm's year": the current rotation and one alternative, month by month,
 * stacked so the months line up for comparison.
 */
export default function FarmYearCard({
  current,
  alternative,
  options,
  onPickAlternative,
  ndviFallback,
  ndviStatus,
  ndviPolling,
}: {
  current: RotationScore | undefined
  alternative: RotationScore | undefined
  options: RotationScore[]
  onPickAlternative: (id: string) => void
  ndviFallback: (number | null)[] | null
  ndviStatus: NdviStatus | undefined
  ndviPolling: boolean
}) {
  const selectId = useId()
  const alt = alternative && alternative.rotation_id !== current?.rotation_id ? alternative : undefined
  const shown = [hasYear(current) ? current : null, hasYear(alt) ? alt : null].filter((r): r is RotationScore => !!r)
  const pickable = options.filter((r) => !r.is_existing && hasYear(r))
  if (shown.length === 0) return null

  return (
    <div className={cx(surface.glass, 'flex flex-col gap-4 p-4 md:p-6')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className={cx('m-0 flex items-center gap-2', type.heading, fg.fg)}>
            <CalendarDays size={22} aria-hidden="true" className={fg.accent} />
            Your farm's year
          </h3>
          <p className={cx('m-0 max-w-[62ch]', type.label, fg.fg2)}>
            What is on the field each month, and how often heat, frost, dry spells or heavy rain hit in past years.
          </p>
        </div>
        {pickable.length > 0 && (
          <label htmlFor={selectId} className={cx('flex min-w-0 flex-col gap-1', type.label, fg.fg2)}>
            Compare with
            <select
              id={selectId}
              value={alt?.rotation_id ?? ''}
              onChange={(e) => e.target.value && onPickAlternative(e.target.value)}
              className="min-h-[44px] max-w-full rounded-[var(--radius-control,1rem)] border border-[color:var(--color-control-border,rgba(190,242,220,0.45))] bg-[rgba(0,0,0,0.25)] px-3 text-[color:var(--color-fg,#ecfdf3)]"
            >
              {!alt && <option value="">Pick another rotation</option>}
              {pickable.map((r) => (
                <option key={r.rotation_id} value={r.rotation_id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <FarmYearLegend />
      <NdviStatusNote status={ndviStatus} polling={ndviPolling} />

      <div className="flex flex-col gap-4">
        {hasYear(current) && <RotationYear rotation={current} tag="You grow now" ndviFallback={ndviFallback} />}
        {hasYear(alt) && <RotationYear rotation={alt} tag="Instead you could grow" ndviFallback={ndviFallback} />}
      </div>
    </div>
  )
}
