/**
 * Badge: 28px non-interactive pill with optional 16px icon.
 *
 * Props
 * - tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'info'   default 'neutral'
 *     neutral = fg-2 on glass-flat; others = tone colour text + 1px border + 14% tint
 * - icon?: LucideIcon                                          16px leading icon (aria-hidden)
 * - outline?: boolean                                          no tint fill (border + text only)
 * - borderStyle?: 'solid' | 'dashed' | 'dotted'                default 'solid'
 * - title?: string, className?: string, children
 *
 * Usage examples: confidence HIGH = <Badge tone="accent" icon={ShieldCheck}>HIGH</Badge>,
 * MEDIUM = warn + Shield, LOW = danger + ShieldAlert, Illustrative = warn + TriangleAlert.
 */
import type { HTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'

export type BadgeTone = 'neutral' | 'accent' | 'warn' | 'danger' | 'info'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  icon?: LucideIcon
  outline?: boolean
  borderStyle?: 'solid' | 'dashed' | 'dotted'
}

const TONE: Record<BadgeTone, { text: string; border: string; fill: string }> = {
  neutral: { text: 'text-fg-2', border: 'border-glass-border', fill: 'bg-glass-flat' },
  accent: { text: 'text-accent', border: 'border-accent/60', fill: 'bg-accent/14' },
  warn: { text: 'text-demo', border: 'border-demo/60', fill: 'bg-demo/14' },
  danger: { text: 'text-danger', border: 'border-danger/60', fill: 'bg-danger/14' },
  info: { text: 'text-derived', border: 'border-derived/60', fill: 'bg-derived/14' },
}

const BORDER = { solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted' } as const

export function Badge({
  tone = 'neutral',
  icon: Icon,
  outline = false,
  borderStyle = 'solid',
  className,
  children,
  ...rest
}: BadgeProps) {
  const t = TONE[tone]
  return (
    <span
      data-component="Badge"
      data-tone={tone}
      className={cn(
        'inline-flex h-[28px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-label font-semibold tabular-nums',
        t.text,
        t.border,
        !outline && t.fill,
        BORDER[borderStyle],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />}
      {children}
    </span>
  )
}

export default Badge
