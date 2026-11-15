/**
 * PageHeader: page title block used at the top of every page.
 *
 * Props
 * - title: ReactNode            Display at 1024+, Heading below. Gets id="page-title" + tabIndex -1
 *                               so AppShell can move focus here on navigation.
 * - eyebrow?: ReactNode         small Label line above the title (fg-3)
 * - subtitle?: ReactNode        Body, fg-2
 * - trailing?: ReactNode        right-aligned slot (reserved for the Phase 5 data-mode indicator)
 * - backTo?: string             renders a ghost "Overview" back link (ArrowLeft) above the title
 * - backLabel?: string          label for the back link (default "Overview")
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { buttonClasses } from '../ui/buttonStyles'
import { cn } from '../ui/cn'
import { useI18n } from '../../lib/i18n'

export interface PageHeaderProps {
  title: ReactNode
  eyebrow?: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  backTo?: string
  backLabel?: string
  className?: string
}

export function PageHeader({ title, eyebrow, subtitle, trailing, backTo, backLabel, className }: PageHeaderProps) {
  const { t } = useI18n()
  return (
    <header data-component="PageHeader" className={cn('mb-6 lg:mb-12', className)}>
      {backTo && (
        <Link to={backTo} className={cn(buttonClasses('ghost'), '-ms-4 mb-2')}>
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden />
          {backLabel ?? t('nav.overview')}
        </Link>
      )}
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="m-0 mb-1 text-label font-semibold uppercase tracking-[0.08em] text-fg-3">{eyebrow}</p>}
          <h1
            id="page-title"
            tabIndex={-1}
            className="m-0 font-display text-heading font-semibold text-fg outline-none focus-visible:outline-none lg:text-display"
          >
            {title}
          </h1>
          {subtitle && <p className="m-0 mt-2 text-body text-fg-2">{subtitle}</p>}
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
      </div>
    </header>
  )
}

export default PageHeader
