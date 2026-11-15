import { useEffect, type MouseEvent, type ReactNode } from 'react'
import {
  BookOpenText,
  Calculator,
  Database,
  Layers,
  ShieldCheck,
  TriangleAlert,
  Users,
  Workflow,
} from 'lucide-react'
import Disclaimer from '../components/Disclaimer'
import IllustrativeBadge from '../components/IllustrativeBadge'
import { Ltr } from '../components/ui/Ltr'
import { cx, surface, tx } from '../lib/ui5/styles'
import { useI18n, type TranslationKey } from '../lib/i18n'

interface SectionDef {
  id: string
  titleKey: TranslationKey
  Icon: typeof BookOpenText
}

const SECTIONS: SectionDef[] = [
  { id: 'how-it-works', titleKey: 'methodology.sections.howItWorks', Icon: Workflow },
  { id: 'scoring', titleKey: 'methodology.sections.scoring', Icon: Calculator },
  { id: 'data-sources', titleKey: 'methodology.sections.dataSources', Icon: Database },
  { id: 'data-quality', titleKey: 'methodology.sections.dataQuality', Icon: Layers },
  { id: 'limitations', titleKey: 'methodology.sections.limitations', Icon: TriangleAlert },
  { id: 'local-expertise', titleKey: 'methodology.sections.localExpertise', Icon: Users },
  { id: 'disclaimer', titleKey: 'methodology.sections.disclaimer', Icon: ShieldCheck },
]

/** Plain string = literal (product codes, units); `{ k }` = dictionary key. */
type Cell = string | { k: TranslationKey }

interface SourceRow {
  source: Cell
  product: Cell
  variable: Cell
  units: Cell
  resolution: Cell
  window: Cell
}

const S = 'methodology.sources.'
const k = (key: string): Cell => ({ k: `${S}${key}` as TranslationKey })

// Plan section 5.1.
const SOURCE_ROWS: SourceRow[] = [
  {
    source: 'NASA POWER',
    product: k('productPowerDaily'),
    variable: k('varRain'),
    units: 'mm/day',
    resolution: k('resPower'),
    window: k('winPowerRain'),
  },
  {
    source: 'NASA POWER',
    product: k('productPowerDaily'),
    variable: k('varTemp'),
    units: '°C',
    resolution: k('resPower'),
    window: k('winPowerTemp'),
  },
  {
    source: 'NASA SMAP L4',
    product: 'SPL4SMGP v007',
    variable: k('varSoilMoisture'),
    units: 'm³/m³',
    resolution: k('resSmap'),
    window: k('winSmap'),
  },
  {
    source: 'NASA MODIS',
    product: 'MOD13Q1 v061',
    variable: k('varNdvi'),
    units: k('unitsNdvi'),
    resolution: k('resModis'),
    window: k('winModis'),
  },
  {
    source: 'NASA SRTM',
    product: 'SRTMGL1 v003',
    variable: k('varTerrain'),
    units: k('unitsTerrain'),
    resolution: k('resSrtm'),
    window: k('winSrtm'),
  },
  {
    source: k('sourceSoilGrids'),
    product: 'SoilGrids v2.0 REST',
    variable: k('varSoil'),
    units: '%, %, g/kg, pH',
    resolution: k('resSoil'),
    window: k('winStatic'),
  },
  {
    source: k('sourceImerg'),
    product: 'IMERG V07',
    variable: k('varImerg'),
    units: 'mm/day',
    resolution: k('resImerg'),
    window: k('winImerg'),
  },
]

const SOURCE_COLS: Array<{ key: keyof SourceRow; label: TranslationKey }> = [
  { key: 'source', label: 'methodology.sources.colSource' },
  { key: 'product', label: 'methodology.sources.colProduct' },
  { key: 'variable', label: 'methodology.sources.colVariable' },
  { key: 'units', label: 'methodology.sources.colUnits' },
  { key: 'resolution', label: 'methodology.sources.colResolution' },
  { key: 'window', label: 'methodology.sources.colWindow' },
]

const QUALITY_ROWS: Array<{ label: 'observed' | 'derived' | 'demo' | 'unavailable' }> = [
  { label: 'observed' },
  { label: 'derived' },
  { label: 'demo' },
  { label: 'unavailable' },
]

const LIMITS = ['smap', 'modis', 'ndvi', 'boundaries', 'farmer', 'thresholds', 'scenario', 'demo', 'now'] as const
const LOCAL = ['soil', 'irrigation', 'market', 'pests', 'windows', 'pixels', 'params'] as const

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  const heading = el.querySelector<HTMLElement>('h2')
  heading?.focus({ preventScroll: true })
}

function Section({ def, children }: { def: SectionDef; children: ReactNode }) {
  const { t } = useI18n()
  const headingId = `${def.id}-title`
  return (
    <section
      id={def.id}
      aria-labelledby={headingId}
      className={cx(surface.glass, 'flex scroll-mt-24 flex-col gap-4 p-4 md:p-6')}
    >
      <h2 id={headingId} tabIndex={-1} className={cx('m-0 flex items-center gap-2', tx.heading, tx.fg)}>
        <def.Icon size={24} strokeWidth={1.75} aria-hidden="true" className={cx('shrink-0', tx.accent)} />
        {t(def.titleKey)}
      </h2>
      {children}
    </section>
  )
}

const P = ({ children }: { children: ReactNode }) => (
  <p className={cx('m-0', tx.body, tx.fg2)}>{children}</p>
)

const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className={cx('m-0 font-semibold', tx.body, tx.fg)}>{children}</h3>
)

/** Formulas stay in English notation and read left to right in both languages. */
const Formula = ({ children }: { children: ReactNode }) => (
  <code
    dir="ltr"
    className={cx(
      surface.flat,
      surface.radiusChip,
      'block overflow-x-auto whitespace-pre-wrap break-words p-2 text-left font-mono',
      tx.label,
      tx.fg,
    )}
  >
    {children}
  </code>
)

const Bullets = ({ items }: { items: ReactNode[] }) => (
  <ul className={cx('m-0 flex list-disc flex-col gap-2 ps-6', tx.body, tx.fg2)}>
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
)

const sectionDef = (id: string) => SECTIONS.find((s) => s.id === id)!

export default function Methodology() {
  const { t } = useI18n()
  const cell = (c: Cell) => (typeof c === 'string' ? <Ltr>{c}</Ltr> : t(c.k))

  // Support deep links such as /methodology#limitations.
  useEffect(() => {
    const id = window.location.hash.replace(/^#/, '')
    if (id && SECTIONS.some((s) => s.id === id)) scrollToSection(id)
  }, [])

  const onNavClick = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    scrollToSection(id)
    window.history.replaceState(window.history.state, '', `#${id}`)
  }

  const strong = (key: TranslationKey) => <strong className={tx.fg}>{t(key)}</strong>

  return (
    <div
      data-page="Methodology"
      className={cx('mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-4 md:p-6 xl:p-8', tx.fg)}
    >
      <header className="flex flex-col gap-2">
        <p className={cx('m-0 font-semibold', tx.label, tx.fg3)}>{t('methodology.eyebrow')}</p>
        <h1 className={cx('m-0', tx.heading, 'lg:text-[length:var(--text-display,2.5rem)]')}>
          {t('methodology.title')}
        </h1>
        <p className={cx('m-0 max-w-[72ch]', tx.body, tx.fg2)}>{t('methodology.intro')}</p>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label={t('methodology.onThisPage')} className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <div className={cx(surface.glass, 'p-4')}>
            <p className={cx('m-0 mb-2 font-semibold', tx.label, tx.fg3)}>{t('methodology.onThisPage')}</p>
            <ol className="m-0 flex list-none flex-row flex-wrap gap-1 p-0 lg:flex-col">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={(e) => onNavClick(e, s.id)}
                    className={cx(
                      surface.radiusControl,
                      'flex min-h-11 items-center gap-2 px-2 font-semibold no-underline transition-colors duration-150',
                      'hover:bg-[var(--color-glass-flat,rgba(255,255,255,0.04))] hover:text-[color:var(--color-fg,#ecfdf3)]',
                      tx.label,
                      tx.fg2,
                    )}
                  >
                    <s.Icon size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
                    {t(s.titleKey)}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Section def={sectionDef('how-it-works')}>
            <P>{t('methodology.how.p1')}</P>
            <ol className={cx('m-0 flex list-decimal flex-col gap-2 ps-6', tx.body, tx.fg2)}>
              <li>
                {strong('methodology.how.extractTitle')} {t('methodology.how.extractBody')}
              </li>
              <li>
                {strong('methodology.how.profileTitle')} {t('methodology.how.profileBody')}
              </li>
              <li>
                {strong('methodology.how.scoreTitle')} {t('methodology.how.scoreBody')}
              </li>
              <li>
                {strong('methodology.how.explainTitle')} {t('methodology.how.explainBody')}
              </li>
            </ol>
            <P>{t('methodology.how.p2')}</P>
          </Section>

          <Section def={sectionDef('scoring')}>
            <div className="flex flex-wrap items-center gap-2">
              <P>{t('methodology.scoring.intro')}</P>
              <IllustrativeBadge />
            </div>

            <H3>{t('methodology.scoring.resilienceTitle')}</H3>
            <P>{t('methodology.scoring.resilienceBody')}</P>
            <Formula>resilience = 100 × mean(viable over all years and seasons)</Formula>

            <H3>{t('methodology.scoring.waterTitle')}</H3>
            <P>{t('methodology.scoring.waterBody')}</P>
            <Formula>water = 100 × (1 − clip(mean water gap ÷ reference gap, 0, 1))</Formula>

            <H3>{t('methodology.scoring.soilTitle')}</H3>
            <P>{t('methodology.scoring.soilBody')}</P>
            <Formula>soil_health = 100 × (0.5 × living-root share + 0.5 × clip(legume N ÷ 100 kg/ha, 0, 1))</Formula>
            <Formula>soil = 0.5 × soil_health + 0.3 × erosion + 0.2 × pest_break</Formula>

            <H3>{t('methodology.scoring.incomeTitle')}</H3>
            <P>{t('methodology.scoring.incomeBody')}</P>
            <Formula>value = Σ(yield × price × viable share) ÷ cycle years;  income = 100 × value ÷ best value</Formula>

            <H3>{t('methodology.scoring.overallTitle')}</H3>
            <P>{t('methodology.scoring.overallBody')}</P>
            <Formula>
              overall = w_water × water + w_soil × soil + w_income × income + w_resilience × resilience
            </Formula>

            <H3>{t('methodology.scoring.rangeTitle')}</H3>
            <P>{t('methodology.scoring.rangeBody')}</P>

            <H3>{t('methodology.scoring.confidenceTitle')}</H3>
            <P>{t('methodology.scoring.confidenceBody')}</P>
            <dl className={cx('m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2', tx.body)}>
              <dt className={cx('font-semibold', tx.fg)}>{t('methodology.scoring.high')}</dt>
              <dd className={cx('m-0', tx.fg2)}>{t('methodology.scoring.highBody')}</dd>
              <dt className={cx('font-semibold', tx.fg)}>{t('methodology.scoring.medium')}</dt>
              <dd className={cx('m-0', tx.fg2)}>{t('methodology.scoring.mediumBody')}</dd>
              <dt className={cx('font-semibold', tx.fg)}>{t('methodology.scoring.low')}</dt>
              <dd className={cx('m-0', tx.fg2)}>{t('methodology.scoring.lowBody')}</dd>
            </dl>
            <P>{t('methodology.scoring.validatedNote')}</P>
          </Section>

          <Section def={sectionDef('data-sources')}>
            <P>{t('methodology.sources.intro')}</P>
            <div className={cx(surface.flat, surface.radiusControl, 'min-w-0 overflow-x-auto')}>
              <table className={cx('w-full min-w-[720px] border-collapse text-start', tx.label)}>
                <caption className="sr-only">{t('methodology.sources.caption')}</caption>
                <thead>
                  <tr className={tx.fg}>
                    {SOURCE_COLS.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className="border-b border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] p-2 text-start font-semibold"
                      >
                        {t(c.label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={cx('font-normal', tx.fg2)}>
                  {SOURCE_ROWS.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] last:border-b-0 align-top"
                    >
                      <th scope="row" className={cx('p-2 text-start font-semibold', tx.fg)}>
                        {cell(r.source)}
                      </th>
                      <td className="p-2">{cell(r.product)}</td>
                      <td className="p-2">{cell(r.variable)}</td>
                      <td className="p-2">{cell(r.units)}</td>
                      <td className="p-2">{cell(r.resolution)}</td>
                      <td className="p-2">{cell(r.window)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <P>{t('methodology.sources.gwetNote')}</P>
          </Section>

          <Section def={sectionDef('data-quality')}>
            <P>{t('methodology.quality.intro')}</P>
            <dl className={cx('m-0 grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4', tx.body)}>
              {QUALITY_ROWS.map((q) => (
                <div key={q.label} className="contents">
                  <dt className={cx('flex flex-wrap items-baseline gap-x-2 font-semibold', tx.fg)}>
                    <code className="font-mono">{q.label}</code>
                    {t(`quality.${q.label}`) !== q.label && <span>{t(`quality.${q.label}`)}</span>}
                  </dt>
                  <dd className={cx('m-0 mb-2 sm:mb-0', tx.fg2)}>{t(`methodology.quality.${q.label}`)}</dd>
                </div>
              ))}
            </dl>
            <P>{t('methodology.quality.nullNote')}</P>
            <P>{t('methodology.quality.modeNote')}</P>
          </Section>

          <Section def={sectionDef('limitations')}>
            <P>{t('methodology.limits.intro')}</P>
            <Bullets
              items={LIMITS.map((id) => (
                <>
                  {strong(`methodology.limits.${id}Title`)} {t(`methodology.limits.${id}Body`)}
                </>
              ))}
            />
          </Section>

          <Section def={sectionDef('local-expertise')}>
            <P>{t('methodology.local.intro')}</P>
            <Bullets items={LOCAL.map((id) => t(`methodology.local.${id}`))} />
          </Section>

          <Section def={sectionDef('disclaimer')}>
            <Disclaimer variant="card" />
            <P>{t('methodology.disclaimerNote')}</P>
          </Section>
        </div>
      </div>
    </div>
  )
}
