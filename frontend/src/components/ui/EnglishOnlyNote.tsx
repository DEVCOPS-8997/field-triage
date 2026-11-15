/**
 * EnglishOnlyNote: a small, polite line shown in Urdu mode above content that is still English only
 * (rotation explanations, insights and other text that comes from the backend).
 * Renders nothing in English. Wrap the English block itself in lang="en" dir="ltr" so it is read
 * and laid out correctly, e.g.
 *   <EnglishOnlyNote />
 *   <div lang="en" dir="ltr">{rotation.explanation}</div>
 *
 * Props
 * - className?: string
 */
import { Languages } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { cn } from './cn'

export function EnglishOnlyNote({ className }: { className?: string }) {
  const { lang, t } = useI18n()
  if (lang === 'en') return null
  return (
    <p
      data-component="EnglishOnlyNote"
      className={cn(
        'm-0 inline-flex max-w-full items-start gap-2 rounded-[var(--radius-chip)] border border-glass-border bg-glass-flat px-3 py-1 text-label font-normal text-fg-2',
        className,
      )}
    >
      <Languages size={16} strokeWidth={1.75} aria-hidden className="mt-[0.4em] shrink-0 text-fg-3" />
      <span>{t('common.englishOnly')}</span>
    </p>
  )
}

export default EnglishOnlyNote
