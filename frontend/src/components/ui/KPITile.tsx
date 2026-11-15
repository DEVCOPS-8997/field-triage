/**
 * KPITile: flat glass stat tile with an accent icon chip.
 *
 * Props
 * - icon: LucideIcon                       20px accent icon in a 40px chip
 * - label: string                          Label, fg-2
 * - value: string | number | null          null renders the word "unavailable" (never 0)
 * - unit?: string                          small suffix after the value
 * - size?: 'lg' | 'sm'                     lg = Display value (Heading below 768px), sm = Heading value
 * - badge?: ReactNode                      bottom-right slot (e.g. a DataQualityBadge)
 * - isLoading?: boolean                    renders a tile Skeleton
 * - className?: string
 * Long values truncate with an ellipsis; the full text is in `title`.
 */
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'
import { Skeleton } from './Skeleton'
import { useI18n } from '../../lib/i18n'

export interface KPITileProps {
  icon: LucideIcon
  label: string
  value: ReactNode | string | number | null
  unit?: string
  size?: 'lg' | 'sm'
  badge?: ReactNode
  isLoading?: boolean
  className?: string
}

export function KPITile({ icon: Icon, label, value, unit, size = 'lg', badge, isLoading, className }: KPITileProps) {
  const { t } = useI18n()
  if (isLoading) return <Skeleton preset="tile" className={className} />
  const isText = typeof value === 'string' || typeof value === 'number'
  const title = isText ? `${value}${unit ? ` ${unit}` : ''}` : undefined
  return (
    <div
      data-component="KPITile"
      className={cn(
        'glass-flat relative flex min-h-[96px] min-w-0 flex-col items-start gap-2 rounded-[var(--radius-control)] p-4 sm:flex-row sm:items-center sm:gap-4',
        className,
      )}
    >
      <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[var(--radius-chip)] bg-accent/14 text-accent shadow-[inset_0_0_0_1px_rgba(74,222,128,0.25)]">
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </span>
      <div className="w-full min-w-0 flex-1 sm:w-auto">
        <p className="m-0 truncate text-label font-normal text-fg-2">{label}</p>
        {value === null || value === undefined ? (
          <p className="m-0 text-label font-normal text-fg-3">{t('common.unavailable')}</p>
        ) : isText ? (
          <p
            title={title}
            className={cn(
              'm-0 truncate font-display font-semibold tabular-nums text-fg',
              size === 'lg' ? 'text-heading md:text-display' : 'text-heading',
            )}
          >
            {value}
            {unit && <span className="ms-1 font-sans text-label font-normal text-fg-2">{unit}</span>}
          </p>
        ) : (
          <div className="pt-1">{value}</div>
        )}
      </div>
      {badge && <div className="absolute bottom-2 end-2">{badge}</div>}
    </div>
  )
}

export default KPITile
