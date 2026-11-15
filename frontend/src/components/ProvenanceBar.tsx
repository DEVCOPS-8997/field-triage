import type { ReactNode } from 'react'
import { CalendarRange, FlaskConical, Satellite } from 'lucide-react'
import type { DataMode, Quality } from '../types/api'
import DataQualityBadge from './DataQualityBadge'
import { formatDate } from '../lib/honesty/format'
import { badgeBase, badgeTone, cx, surface, tx } from '../lib/ui5/styles'
import { useI18n } from '../lib/i18n'
import { Ltr } from './ui/Ltr'

export interface ProvenanceBarProps {
  dataMode: DataMode
  dataQuality: Record<string, Quality>
  dataSources?: Record<string, string>
  periodStart?: string
  periodEnd?: string
  /** Shown only when the API returns it. */
  generatedAt?: string
  /** Custom badge renderer; defaults to DataQualityBadge. */
  renderBadge?: (q: Quality) => ReactNode
  className?: string
}

const SOURCE_ORDER = ['power', 'smap', 'modis', 'soil', 'terrain'] as const

const SOURCE_LABEL: Record<string, string> = {
  power: 'POWER',
  smap: 'SMAP',
  modis: 'MODIS',
  soil: 'Soil',
  terrain: 'Terrain',
  imerg: 'IMERG',
}

const SOURCE_LABEL_UR: Record<string, string> = { soil: 'مٹی', terrain: 'زمین کی ڈھلوان' }

/** The five core sources first (missing ones read "unavailable"), then any extras. */
function sourceKeys(dataQuality: Record<string, Quality>): string[] {
  const extras = Object.keys(dataQuality).filter(
    (k) => !(SOURCE_ORDER as readonly string[]).includes(k),
  )
  return [...SOURCE_ORDER, ...extras]
}

export default function ProvenanceBar({
  dataMode,
  dataQuality,
  dataSources,
  periodStart,
  periodEnd,
  generatedAt,
  renderBadge,
  className,
}: ProvenanceBarProps) {
  const { lang, t, formatDate: fmtDate } = useI18n()
  const labelFor = (key: string) =>
    (lang === 'ur' ? SOURCE_LABEL_UR[key] : undefined) ?? SOURCE_LABEL[key] ?? key
  const date = (v: string | undefined, missing?: string) =>
    lang === 'en' ? formatDate(v, missing) : fmtDate(v, missing ?? t('common.unavailable'))
  const badge = renderBadge ?? ((q: Quality) => <DataQualityBadge quality={q} />)
  const keys = sourceKeys(dataQuality)
  const isDemo = dataMode === 'demo'
  const hasSources = !!dataSources && Object.keys(dataSources).length > 0

  return (
    <section
      data-component="ProvenanceBar"
      data-mode={dataMode}
      aria-label={t('provenance.ariaLabel')}
      className={cx(surface.strong, surface.radiusControl, 'flex flex-col gap-2 p-2 sm:p-4', tx.fg, className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cx(
            badgeBase,
            isDemo ? badgeTone.warn : badgeTone.accent,
            isDemo && 'border-dashed',
          )}
          title={isDemo ? t('provenance.demoTitle') : t('provenance.observedTitle')}
        >
          {isDemo ? (
            <FlaskConical size={16} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Satellite size={16} strokeWidth={1.75} aria-hidden="true" />
          )}
          {isDemo ? t('provenance.demoData') : t('provenance.observedNasa')}
        </span>

        <ul aria-label={t('provenance.qualityBySource')} className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
          {keys.map((key) => {
            const q: Quality = dataQuality[key] ?? 'unavailable'
            const src = dataSources?.[key]
            return (
              <li
                key={key}
                data-source={key}
                title={src ? `${labelFor(key)}: ${src}` : undefined}
                className={cx(surface.flat, 'inline-flex items-center gap-1 rounded-full p-1 ps-2')}
              >
                <span className={cx('font-semibold', tx.label, tx.fg2)}>{labelFor(key)}</span>
                {badge(q)}
              </li>
            )
          })}
        </ul>

        {(periodStart || periodEnd) && (
          <span className={cx('inline-flex items-center gap-1', tx.label, tx.fg2, tx.num)}>
            <CalendarRange size={16} strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">{t('provenance.periodCovered')}</span>
            {t('provenance.periodRange', {
              start: date(periodStart, t('provenance.unknownStart')),
              end: date(periodEnd, t('provenance.unknownEnd')),
            })}
          </span>
        )}

        {generatedAt && (
          <span className={cx(tx.label, tx.fg3, tx.num)}>{t('provenance.generated', { date: date(generatedAt) })}</span>
        )}
      </div>

      {hasSources && (
        <details className={cx(tx.label, tx.fg2)}>
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold">
            {t('provenance.dataSources')}
          </summary>
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 pb-2">
            {Object.entries(dataSources!).map(([key, src]) => (
              <div key={key} className="contents">
                <dt className={cx('font-semibold', tx.fg)}>{labelFor(key)}</dt>
                <dd className="m-0 break-words">
                  <Ltr as="span" className="inline-block">
                    {src}
                  </Ltr>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  )
}
