import { useId } from 'react'
import { TriangleAlert } from 'lucide-react'
import { ILLUSTRATIVE_TOOLTIP } from '../lib/honesty/format'
import { badgeBase, badgeTone, cx, surface, tx } from '../lib/ui5/styles'

export interface IllustrativeBadgeProps {
  /** Pass the parameters' `validated` flag; the badge hides when it is true. */
  validated?: boolean
  /** Override the tooltip text. */
  tooltip?: string
  className?: string
}

/**
 * Warn-tone "Illustrative" pill (solid border, so it never reads as demo).
 * Focusable so keyboard users get the tooltip; the tooltip text is also the
 * accessible description, so it is never hover-only information.
 */
export default function IllustrativeBadge({
  validated = false,
  tooltip = ILLUSTRATIVE_TOOLTIP,
  className,
}: IllustrativeBadgeProps) {
  const tipId = useId()
  if (validated) return null

  return (
    <span data-component="IllustrativeBadge" className={cx('group relative inline-flex', className)}>
      <span
        tabIndex={0}
        title={tooltip}
        aria-describedby={tipId}
        className={cx(badgeBase, badgeTone.warn, 'cursor-help')}
      >
        <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
        Illustrative
      </span>
      <span
        id={tipId}
        role="tooltip"
        className={cx(
          surface.strong,
          surface.radiusChip,
          tx.label,
          tx.fg,
          'pointer-events-none invisible absolute left-0 top-full z-20 mt-1 w-64 max-w-[calc(100vw-32px)] p-2 font-normal opacity-0 transition-opacity duration-150',
          'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
        )}
      >
        {tooltip}
      </span>
    </span>
  )
}
