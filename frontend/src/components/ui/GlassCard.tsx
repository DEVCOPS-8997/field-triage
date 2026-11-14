/**
 * GlassCard: the translucent rounded surface every panel sits on.
 *
 * Props
 * - tone: 'default' | 'strong' | 'flat'   (default 'default'; flat = no blur, use inside another glass)
 * - padding: 'none' | 'md' | 'lg'          (default responsive: 16px below 768, 24px above; md = 16, lg = 24)
 * - selected?: boolean                     accent border + glow
 * - interactive?: boolean                  hover lift; render it `as="button"` or `as="a"` for real semantics
 * - as?: element type                      default 'div' (e.g. 'section', 'article', 'button')
 * - title?: ReactNode                      optional header title (Heading, Fraunces)
 * - actions?: ReactNode                    optional trailing header slot
 * - titleId?: string                       id placed on the title (useful for aria-labelledby)
 * Any other HTML attribute is forwarded to the root.
 */
import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export interface GlassCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  tone?: 'default' | 'strong' | 'flat'
  padding?: 'none' | 'md' | 'lg' | 'auto'
  selected?: boolean
  interactive?: boolean
  as?: ElementType
  title?: ReactNode
  actions?: ReactNode
  titleId?: string
  [key: `data-${string}`]: string | undefined
}

const TONE = {
  default: 'glass',
  strong: 'glass-strong',
  flat: 'glass-flat',
} as const

const PAD = {
  none: '',
  md: 'p-4',
  lg: 'p-6',
  auto: 'p-4 md:p-6',
} as const

export function GlassCard({
  tone = 'default',
  padding = 'auto',
  selected = false,
  interactive = false,
  as: Tag = 'div',
  title,
  actions,
  titleId,
  className,
  children,
  ...rest
}: GlassCardProps) {
  return (
    <Tag
      data-component="GlassCard"
      className={cn(
        TONE[tone],
        'relative min-w-0 rounded-[var(--radius-card)] text-fg',
        tone === 'flat' && 'rounded-[var(--radius-control)]',
        PAD[padding],
        selected && 'border-accent! shadow-[var(--shadow-glow)]!',
        interactive &&
          'motion-transform block w-full min-h-[44px] cursor-pointer text-left transition duration-150 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:border-control-border',
        className,
      )}
      {...rest}
    >
      {(title || actions) && (
        <div className="mb-4 flex min-w-0 items-center justify-between gap-2">
          {title && (
            <h2 id={titleId} className="min-w-0 truncate font-display text-heading font-semibold">
              {title}
            </h2>
          )}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  )
}

export default GlassCard
