/**
 * buttonClasses(variant, size, iconOnly?): the class string Button / IconButton use.
 * Exported separately so a react-router <Link> can look exactly like a Button:
 *   <Link to="/x" className={buttonClasses('primary')}>Compare rotations</Link>
 */
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-ink hover:bg-accent-hi shadow-[0_0_20px_rgba(74,222,128,0.28)] border border-transparent',
  secondary:
    'bg-glass-flat text-fg border border-control-border hover:bg-[rgba(255,255,255,0.08)]',
  ghost: 'bg-transparent text-fg-2 border border-transparent hover:bg-glass-flat hover:text-fg',
}

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-[44px]',
  lg: 'min-h-[48px]',
}

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', iconOnly = false) {
  return cn(
    'motion-transform inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-[var(--radius-control)] text-label font-semibold no-underline',
    'transition duration-150 ease-[var(--ease-out-soft)] active:scale-[0.98]',
    'aria-disabled:pointer-events-none aria-disabled:opacity-50 disabled:pointer-events-none disabled:opacity-50',
    VARIANT[variant],
    SIZE[size],
    iconOnly ? (size === 'lg' ? 'size-[48px] p-0' : 'size-[44px] p-0') : 'px-4',
  )
}
