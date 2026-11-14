/**
 * IconButton: 44 x 44 square icon-only button with a required accessible label and a Tooltip.
 *
 * Props (plus any native <button> attribute)
 * - label: string                                  aria-label and tooltip text (required)
 * - icon: LucideIcon                               20px icon
 * - variant?: 'primary' | 'secondary' | 'ghost'    default 'secondary'
 * - size?: 'md' | 'lg'                             44 or 48px square
 * - tooltipSide?: 'top' | 'right' | 'bottom' | 'left' | 'none'   default 'left'; 'none' hides the tooltip
 * - loading?: boolean                              spinner, aria-busy, disabled
 * - iconClassName?: string                         extra classes for the icon (e.g. accent colour)
 */
import type { ButtonHTMLAttributes } from 'react'
import { LoaderCircle, type LucideIcon } from 'lucide-react'
import { cn } from './cn'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles'
import { Tooltip } from './Tooltip'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
  icon: LucideIcon
  variant?: ButtonVariant
  size?: ButtonSize
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left' | 'none'
  loading?: boolean
  iconClassName?: string
}

export function IconButton({
  label,
  icon: Icon,
  variant = 'secondary',
  size = 'md',
  tooltipSide = 'left',
  loading = false,
  disabled,
  className,
  iconClassName,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const isDisabled = disabled || loading
  const btn = (
    <button
      data-component="IconButton"
      type={type}
      aria-label={label}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size, true), className)}
      {...rest}
    >
      {loading ? (
        <LoaderCircle size={20} strokeWidth={1.75} className="fsa-spin" aria-hidden />
      ) : (
        <Icon size={20} strokeWidth={1.75} className={iconClassName} aria-hidden />
      )}
    </button>
  )
  if (tooltipSide === 'none') return btn
  return (
    <Tooltip content={label} side={tooltipSide}>
      {btn}
    </Tooltip>
  )
}

export default IconButton
