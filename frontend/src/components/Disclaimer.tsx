import { ShieldCheck } from 'lucide-react'
import { DISCLAIMER_TEXT } from '../lib/honesty/format'
import { cx, surface, tx } from '../lib/ui5/styles'
import { useI18n } from '../lib/i18n'

export interface DisclaimerProps {
  /** "card" = sidebar footer (flat glass, padding 16); "inline" = footer line. */
  variant?: 'card' | 'inline'
  /** The API's `disclaimer` string (CompareResponse.disclaimer), if any. */
  text?: string | null
  className?: string
}

/**
 * The verbatim sentence is always shown. If the API sends its own disclaimer
 * and it already contains that statement, the API text is shown as is;
 * otherwise the API text follows the verbatim sentence.
 */
function resolveText(text: string | null | undefined): string {
  const api = text?.trim()
  if (!api) return DISCLAIMER_TEXT
  if (/does not replace/i.test(api)) return api
  return `${DISCLAIMER_TEXT} ${api}`
}

/**
 * Urdu: the verbatim sentence is shown in Urdu. If the API sent extra English wording beyond the
 * standard sentence, it follows in English (marked lang="en") so nothing from the API is dropped.
 */
function UrduBody({ text, sentence }: { text: string | null | undefined; sentence: string }) {
  const api = text?.trim()
  const extra = api && api !== DISCLAIMER_TEXT ? api.replace(DISCLAIMER_TEXT, '').trim() : ''
  return (
    <>
      {sentence}
      {extra && (
        <>
          {' '}
          <span lang="en" dir="ltr" className="ltr">
            {extra}
          </span>
        </>
      )}
    </>
  )
}

export default function Disclaimer({ variant = 'card', text, className }: DisclaimerProps) {
  const { lang, t } = useI18n()
  const body = lang === 'en' ? resolveText(text) : <UrduBody text={text} sentence={t('disclaimer.text')} />

  if (variant === 'inline') {
    return (
      <p
        data-component="Disclaimer"
        data-variant="inline"
        className={cx('m-0 flex items-start gap-2 font-normal', tx.label, tx.fg3, className)}
      >
        <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" className="mt-[0.15lh] shrink-0" />
        <span>{body}</span>
      </p>
    )
  }

  return (
    <aside
      data-component="Disclaimer"
      data-variant="card"
      aria-label={t('disclaimer.ariaLabel')}
      className={cx(surface.flat, surface.radiusControl, 'flex items-start gap-2 p-4', className)}
    >
      <ShieldCheck
        size={16}
        strokeWidth={1.75}
        aria-hidden="true"
        className={cx('mt-[0.15lh] shrink-0', tx.fg3)}
      />
      <p className={cx('m-0 font-normal', tx.label, tx.fg2)}>{body}</p>
    </aside>
  )
}
