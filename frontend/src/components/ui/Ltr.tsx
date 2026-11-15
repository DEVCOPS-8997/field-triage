/**
 * Ltr: keeps numbers with units, coordinates, codes and English names in left-to-right order
 * inside Urdu (RTL) text, e.g. <Ltr>-12 mm</Ltr>, <Ltr>31.52° N, 74.36° E</Ltr>, <Ltr>F-03</Ltr>.
 * Renders <bdi dir="ltr" class="ltr"> (bidi-isolated). Harmless in English.
 *
 * Props
 * - as?: 'span' | 'bdi' | 'div' | 'p' | 'code'   default 'bdi'
 * - className?, title?, children
 */
import type { ReactNode } from 'react'
import { cn } from './cn'

export interface LtrProps {
  as?: 'span' | 'bdi' | 'div' | 'p' | 'code'
  className?: string
  title?: string
  children: ReactNode
}

export function Ltr({ as: Tag = 'bdi', className, title, children }: LtrProps) {
  return (
    <Tag dir="ltr" title={title} className={cn('ltr', className)}>
      {children}
    </Tag>
  )
}

export default Ltr
