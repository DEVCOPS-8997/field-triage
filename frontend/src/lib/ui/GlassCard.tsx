import type { HTMLAttributes, ReactNode } from 'react'
import { text } from './tokens'

type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  tone?: 'default' | 'strong' | 'flat'
  padding?: 'none' | 'md' | 'lg'
  selected?: boolean
  as?: 'div' | 'section' | 'article' | 'li'
  title?: ReactNode
  actions?: ReactNode
}

const toneClass = {
  default:
    'bg-[color:var(--color-glass,rgba(16,48,32,0.7))] backdrop-blur-[12px] md:backdrop-blur-[20px] backdrop-saturate-[1.4] shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] rounded-[var(--radius-card,1.5rem)]',
  strong:
    'bg-[color:var(--color-glass-strong,rgba(8,28,18,0.82))] backdrop-blur-[12px] md:backdrop-blur-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] rounded-[var(--radius-card,1.5rem)]',
  flat: 'bg-[color:var(--color-glass-flat,rgba(255,255,255,0.04))] rounded-[var(--radius-control,1rem)]',
}

const padClass = { none: '', md: 'p-4', lg: 'p-4 md:p-6' }

/** Spec GlassCard (UI-SPEC "Shared Primitives"). Local copy for Phase 3. */
export function GlassCard({
  tone = 'default',
  padding = 'lg',
  selected = false,
  as: Tag = 'div',
  title,
  actions,
  className = '',
  children,
  ...rest
}: Props) {
  const border = selected
    ? 'border border-[color:var(--color-accent,#4ade80)] shadow-[0_0_0_1px_#4ade80,0_0_24px_rgba(74,222,128,0.25)]'
    : 'border border-[color:var(--color-glass-border,rgba(190,242,220,0.16))]'
  return (
    <Tag
      data-component="GlassCard"
      className={`${toneClass[tone]} ${border} ${padClass[padding]} text-[color:var(--color-fg,#ecfdf3)] ${className}`}
      {...rest}
    >
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-2">
          {title && <h2 className={text.heading}>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </Tag>
  )
}

export default GlassCard
