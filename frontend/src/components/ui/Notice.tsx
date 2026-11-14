/**
 * Notice: inline banner for status, warnings and errors.
 *
 * Props
 * - tone?: 'info' | 'warn' | 'error' | 'success'   default 'info'
 *     info/warn/success -> role="status" aria-live="polite"; error -> role="alert"
 * - title?: ReactNode                             optional bold first line
 * - children: ReactNode                           message (Body, fg)
 * - actions?: ReactNode                           buttons (use ghost Buttons); below text on phone, inline on wide
 * - onDismiss?: () => void                        shows a dismiss IconButton; Esc also dismisses while focused inside
 * - icon?: LucideIcon                             override the tone icon
 * - compact?: boolean                             Label-size text and 8px padding (map overlays)
 * - className?: string
 */
import type { KeyboardEvent, ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { cn } from './cn'
import { IconButton } from './IconButton'

export type NoticeTone = 'info' | 'warn' | 'error' | 'success'

export interface NoticeProps {
  tone?: NoticeTone
  title?: ReactNode
  children: ReactNode
  actions?: ReactNode
  onDismiss?: () => void
  icon?: LucideIcon
  compact?: boolean
  className?: string
}

const TONE: Record<NoticeTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: 'bg-derived/14 border-derived/40', icon: 'text-derived', Icon: Info },
  warn: { box: 'bg-demo/14 border-demo/40', icon: 'text-demo', Icon: TriangleAlert },
  error: { box: 'bg-danger/14 border-danger/40', icon: 'text-danger', Icon: CircleAlert },
  success: { box: 'bg-accent/14 border-accent/40', icon: 'text-accent', Icon: CircleCheck },
}

export function Notice({
  tone = 'info',
  title,
  children,
  actions,
  onDismiss,
  icon,
  compact = false,
  className,
}: NoticeProps) {
  const t = TONE[tone]
  const Icon = icon ?? t.Icon
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && onDismiss) {
      e.stopPropagation()
      onDismiss()
    }
  }
  return (
    <div
      data-component="Notice"
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      onKeyDown={onKeyDown}
      className={cn(
        'flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] border text-fg',
        compact ? 'p-2 text-label' : 'p-4 text-body',
        t.box,
        className,
      )}
    >
      <span className={cn('flex shrink-0 items-center', compact ? 'h-[20px] pl-1' : 'h-[24px]')}>
        <Icon size={20} strokeWidth={1.75} aria-hidden className={t.icon} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="min-w-0 flex-1">
          {title && <p className="m-0 font-semibold">{title}</p>}
          <div className="m-0">{children}</div>
        </div>
        {actions && <div className="-ml-4 flex flex-wrap items-center gap-2 sm:ml-0">{actions}</div>}
      </div>
      {onDismiss && (
        <IconButton
          label="Dismiss"
          icon={X}
          variant="ghost"
          tooltipSide="none"
          onClick={onDismiss}
          className="-my-2 -mr-2"
        />
      )}
    </div>
  )
}

export default Notice
