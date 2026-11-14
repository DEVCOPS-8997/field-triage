/**
 * Button: text button, 44px (md) or 48px (lg) tall.
 *
 * Props (plus any native <button> attribute)
 * - variant?: 'primary' | 'secondary' | 'ghost'   (default 'secondary'; one primary per surface)
 * - size?: 'md' | 'lg'                            (default 'md')
 * - icon?: LucideIcon                             optional leading 20px icon
 * - trailingIcon?: LucideIcon                     optional trailing 20px icon
 * - loading?: boolean                             spinner replaces the leading icon, aria-busy, disabled
 * `type` defaults to "button". For links that look like buttons use buttonClasses() from './buttonStyles'.
 */
import type { ButtonHTMLAttributes } from 'react'
import { LoaderCircle, type LucideIcon } from 'lucide-react'
import { cn } from './cn'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  trailingIcon?: LucideIcon
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  trailingIcon: Trailing,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading
  return (
    <button
      data-component="Button"
      type={type}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size), className)}
      {...rest}
    >
      {loading ? (
        <LoaderCircle size={20} strokeWidth={1.75} className="fsa-spin" aria-hidden />
      ) : (
        Icon && <Icon size={20} strokeWidth={1.75} aria-hidden />
      )}
      {children}
      {Trailing && <Trailing size={20} strokeWidth={1.75} aria-hidden />}
    </button>
  )
}

export default Button
