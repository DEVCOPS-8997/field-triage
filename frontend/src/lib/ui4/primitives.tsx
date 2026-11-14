import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cx, fg, surface, type } from './cls'
import type { MarkerShape } from '../charts/tokens'

/** Glass card with optional Heading title and trailing slot (02-UI-SPEC GlassCard, local copy). */
export function Card({
  title,
  titleId,
  actions,
  tone = 'glass',
  className,
  children,
}: {
  title?: ReactNode
  titleId?: string
  actions?: ReactNode
  tone?: 'glass' | 'flat'
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className={cx(surface[tone], 'flex min-w-0 flex-col gap-4 p-4 md:p-6', fg.fg, className)}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {title && (
            <h3 id={titleId} className={type.heading}>
              {title}
            </h3>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

const BADGE_TONES = {
  neutral:
    'text-[color:var(--color-fg-2,#b4cfc0)] bg-[color:var(--color-glass-flat,rgba(255,255,255,0.04))] border-[color:var(--color-glass-border,rgba(190,242,220,0.16))]',
  accent: 'text-[color:var(--color-accent,#4ade80)] bg-[rgba(74,222,128,0.14)] border-[color:var(--color-accent,#4ade80)]',
  warn: 'text-[color:var(--color-demo,#fbbf24)] bg-[rgba(251,191,36,0.14)] border-[color:var(--color-demo,#fbbf24)]',
  danger: 'text-[color:var(--color-danger,#fda4af)] bg-[rgba(253,164,175,0.14)] border-[color:var(--color-danger,#fda4af)]',
  info: 'text-[color:var(--color-derived,#c4b5fd)] bg-[rgba(196,181,253,0.14)] border-[color:var(--color-derived,#c4b5fd)]',
} as const

export function Badge({
  tone = 'neutral',
  icon: Icon,
  children,
  title,
}: {
  tone?: keyof typeof BADGE_TONES
  icon?: LucideIcon
  children: ReactNode
  title?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 font-semibold',
        type.label,
        BADGE_TONES[tone],
      )}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </span>
  )
}

/** Legend marker swatch: shape cue so charts never rely on colour alone. */
export function Marker({ shape, color }: { shape: MarkerShape; color: string }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true as const }
  switch (shape) {
    case 'circle':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5" fill={color} />
        </svg>
      )
    case 'square':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="10" height="10" rx="1" fill={color} />
        </svg>
      )
    case 'diamond':
      return (
        <svg {...common}>
          <path d="M8 2 L14 8 L8 14 L2 8 Z" fill={color} />
        </svg>
      )
    case 'triangle':
      return (
        <svg {...common}>
          <path d="M8 2 L14 13 L2 13 Z" fill={color} />
        </svg>
      )
    case 'dashed':
      return (
        <svg {...common}>
          <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" strokeDasharray="4 3" />
        </svg>
      )
    case 'hatch':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="14" height="14" rx="2" fill={color} fillOpacity="0.22" />
          <path d="M1 9 L9 1 M1 15 L15 1 M7 15 L15 7" stroke={color} strokeWidth="1.5" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )
  }
}

export function LegendRow({ items }: { items: { label: string; color: string; shape: MarkerShape }[] }) {
  return (
    <ul className={cx('flex flex-wrap gap-x-4 gap-y-1', type.label, fg.fg2)} aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-2">
          <Marker shape={it.shape} color={it.color} />
          <span className="font-semibold">{it.label}</span>
        </li>
      ))}
    </ul>
  )
}
