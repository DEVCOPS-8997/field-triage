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
import { cx, surface, tx } from '../lib/ui5/styles'

interface SectionDef {
  id: string
  title: string
  Icon: typeof BookOpenText
}

const SECTIONS: SectionDef[] = [
  { id: 'how-it-works', title: 'How it works', Icon: Workflow },
  { id: 'scoring', title: 'Scoring method', Icon: Calculator },
  { id: 'data-sources', title: 'Data sources', Icon: Database },
  { id: 'data-quality', title: 'Data quality labels', Icon: Layers },
  { id: 'limitations', title: 'Limitations', Icon: TriangleAlert },
  { id: 'local-expertise', title: 'Where local expertise is needed', Icon: Users },
  { id: 'disclaimer', title: 'Disclaimer', Icon: ShieldCheck },
]

interface SourceRow {
  source: string
  product: string
  variable: string
  units: string
  resolution: string
  window: string
}

// Plan section 5.1.
const SOURCE_ROWS: SourceRow[] = [
  {
    source: 'NASA POWER',
    product: 'Daily point API, community AG',
    variable: 'PRECTOTCORR (precipitation, bias-corrected)',
    units: 'mm/day',
    resolution: 'About 0.5° × 0.625° grid (tens of km)',
    window: '2005 to latest (ends about 5 days before today)',
  },
  {
    source: 'NASA POWER',
    product: 'Daily point API, community AG',
    variable: 'T2M, T2M_MAX, T2M_MIN (air temperature at 2 m)',
    units: '°C',
    resolution: 'About 0.5° × 0.625° grid (tens of km)',
    window: '2005 to latest',
  },
  {
    source: 'NASA SMAP L4',
    product: 'SPL4SMGP v007',
    variable: 'sm_surface, sm_rootzone (soil moisture)',
    units: 'm³/m³',
    resolution: '9 km cell; 3-hourly values averaged to daily',
    window: 'April 2015 to latest',
  },
  {
    source: 'NASA MODIS',
    product: 'MOD13Q1 v061',
    variable: 'NDVI, EVI (vegetation index)',
    units: 'Unitless (raw values × 0.0001)',
    resolution: '250 m pixel; 16-day composites, interpolated to daily',
    window: '2010 to latest',
  },
  {
    source: 'NASA SRTM',
    product: 'SRTMGL1 v003',
    variable: 'elevation_m, slope_deg',
    units: 'm, degrees',
    resolution: '30 m (1 arc-second)',
    window: 'Static (2000 mission)',
  },
  {
    source: 'SoilGrids (ISRIC, not NASA)',
    product: 'SoilGrids v2.0 REST',
    variable: 'clay, sand, soc, phh2o at 0–30 cm',
    units: '%, %, g/kg, pH',
    resolution: '250 m',
    window: 'Static',
  },
  {
    source: 'NASA GPM IMERG (optional)',
    product: 'IMERG V07',
    variable: 'precipitation (rainfall cross-check)',
    units: 'mm/day',
    resolution: 'About 0.1° (about 10 km)',
    window: '2015 to latest, if available',
  },
]

const QUALITY_ROWS: Array<{ label: string; meaning: string }> = [
  { label: 'observed', meaning: 'Measured by a satellite or sensor (for example POWER rainfall, SMAP soil moisture, MODIS NDVI).' },
  { label: 'derived', meaning: 'Calculated from observed data (for example trends, percentiles, bare-soil days, scores).' },
  { label: 'demo', meaning: 'Synthetic demo data, not a measurement. Used so the tool can run without live NASA data.' },
  { label: 'unavailable', meaning: 'No data exists for this value. The tool shows it as missing and lowers confidence.' },
]

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  const heading = el.querySelector<HTMLElement>('h2')
  heading?.focus({ preventScroll: true })
}

function Section({ def, children }: { def: SectionDef; children: ReactNode }) {
  const headingId = `${def.id}-title`
  return (
    <section
      id={def.id}
      aria-labelledby={headingId}
      className={cx(surface.glass, 'flex scroll-mt-24 flex-col gap-4 p-4 md:p-6')}
    >
      <h2 id={headingId} tabIndex={-1} className={cx('m-0 flex items-center gap-2', tx.heading, tx.fg)}>
        <def.Icon size={24} strokeWidth={1.75} aria-hidden="true" className={cx('shrink-0', tx.accent)} />
        {def.title}
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

const Formula = ({ children }: { children: ReactNode }) => (
  <code
    className={cx(
      surface.flat,
      surface.radiusChip,
      'block overflow-x-auto whitespace-pre-wrap break-words p-2 font-mono',
      tx.label,
      tx.fg,
    )}
  >
    {children}
  </code>
)

const Bullets = ({ items }: { items: ReactNode[] }) => (
  <ul className={cx('m-0 flex list-disc flex-col gap-2 pl-6', tx.body, tx.fg2)}>
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
)

const sectionDef = (id: string) => SECTIONS.find((s) => s.id === id)!

export default function Methodology() {
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

  return (
    <div
      data-page="Methodology"
      className={cx('mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-4 md:p-6 xl:p-8', tx.fg)}
    >
      <header className="flex flex-col gap-2">
        <p className={cx('m-0 font-semibold', tx.label, tx.fg3)}>How the tool works</p>
        <h1 className={cx('m-0', tx.heading, 'lg:text-[length:var(--text-display,2.5rem)]')}>Methodology</h1>
        <p className={cx('m-0 max-w-[72ch]', tx.body, tx.fg2)}>
          The data sources, how scores are built, how far to trust them, and what the tool cannot do.
        </p>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <div className={cx(surface.glass, 'p-4')}>
            <p className={cx('m-0 mb-2 font-semibold', tx.label, tx.fg3)}>On this page</p>
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
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Section def={sectionDef('how-it-works')}>
            <P>
              Field Shift compares crop rotations for a field using long-term NASA Earth observations, not just
              recent weather. A rotation is a multi-season choice, so each field gets a 10 to 20 year climate
              baseline.
            </P>
            <ol className={cx('m-0 flex list-decimal flex-col gap-2 pl-6', tx.body, tx.fg2)}>
              <li>
                <strong className={tx.fg}>Extract.</strong> An offline pipeline pulls, once per field: NASA POWER
                daily rain and temperature, SMAP L4 soil moisture, MODIS NDVI vegetation history, SoilGrids soil
                properties and SRTM terrain.
              </li>
              <li>
                <strong className={tx.fg}>Profile.</strong> The raw series become a per-field profile: monthly
                records, climatology (rain totals and variability, trends, dry spells, heavy-rain days, frost dates,
                heat days, water deficit), the NDVI season curve with bare-soil days, soil and terrain.
              </li>
              <li>
                <strong className={tx.fg}>Score.</strong> Each rotation is tested against every historical year of
                that profile, using crop characteristics, the farmer&apos;s inputs and the priorities you set.
              </li>
              <li>
                <strong className={tx.fg}>Explain.</strong> Each result lists why it was suggested, the evidence,
                benefits, risks, data gaps and what needs local review.
              </li>
            </ol>
            <P>
              The app reads these precomputed profiles, so a demo never depends on a live NASA call.
            </P>
          </Section>

          <Section def={sectionDef('scoring')}>
            <div className="flex flex-wrap items-center gap-2">
              <P>Every component is a score from 0 to 100.</P>
              <IllustrativeBadge />
            </div>

            <H3>Resilience</H3>
            <P>
              The share of historical years and seasons in which the rotation stays viable: heat days within the
              crop&apos;s tolerance, no frost on frost-sensitive crops, and rain plus irrigation covering at least 60%
              of the crop&apos;s water need.
            </P>
            <Formula>resilience = 100 × mean(viable over all years and seasons)</Formula>

            <H3>Water</H3>
            <P>How far rain and irrigation fall short of the crops&apos; water needs, on average.</P>
            <Formula>water = 100 × (1 − clip(mean water gap ÷ reference gap, 0, 1))</Formula>

            <H3>Soil</H3>
            <P>
              Soil health follows the USDA NRCS soil health principles: months with a living crop in the field (from the
              crop calendars) and net nitrogen left by legumes (from cited field studies, for example 33 to 66 kg/ha for
              berseem). Erosion risk uses bare-soil time, Copernicus DEM slope and NASA POWER heavy-rain days. Pest break
              checks whether consecutive crops belong to different plant families (NRCS Conservation Crop Rotation, Code 328).
            </P>
            <Formula>soil_health = 100 × (0.5 × living-root share + 0.5 × clip(legume N ÷ 100 kg/ha, 0, 1))</Formula>
            <Formula>soil = 0.5 × soil_health + 0.3 × erosion + 0.2 × pest_break</Formula>

            <H3>Income</H3>
            <P>
              Expected crop sales per hectare per year: the country&apos;s average yield and farm-gate price from FAOSTAT
              (the latest 3 reported years, never older than 5 years), counting only the seasons in which the crop was
              viable at this location, divided by the rotation length in years. The best option scores 100. If any option
              lacks current FAOSTAT data, income is not scored for any of them and its weight is shared over the other three.
            </P>
            <Formula>value = Σ(yield × price × viable share) ÷ cycle years;  income = 100 × value ÷ best value</Formula>

            <H3>Overall score</H3>
            <P>A weighted sum using your priority weights, which always add up to 1.00.</P>
            <Formula>
              overall = w_water × water + w_soil × soil + w_income × income + w_resilience × resilience
            </Formula>

            <H3>Uncertainty range</H3>
            <P>
              The overall score is computed for each historical year separately. The range shown runs from the 10th
              percentile (low) to the 90th percentile (high) across those years. A wide range means the result
              depends a lot on what kind of year it is.
            </P>

            <H3>Confidence</H3>
            <P>
              Coverage is the share of the five inputs (POWER, SMAP, MODIS, soil, terrain) that are available for the
              field.
            </P>
            <dl className={cx('m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2', tx.body)}>
              <dt className={cx('font-semibold', tx.fg)}>HIGH</dt>
              <dd className={cx('m-0', tx.fg2)}>
                Coverage at least 0.8, at least 10 years of data, and validated scoring parameters.
              </dd>
              <dt className={cx('font-semibold', tx.fg)}>MEDIUM</dt>
              <dd className={cx('m-0', tx.fg2)}>Coverage at least 0.5.</dd>
              <dt className={cx('font-semibold', tx.fg)}>LOW</dt>
              <dd className={cx('m-0', tx.fg2)}>Anything else.</dd>
            </dl>
            <P>
              While the scoring parameters are marked validated: false, confidence cannot reach HIGH and results carry
              an Illustrative badge.
            </P>
          </Section>

          <Section def={sectionDef('data-sources')}>
            <P>Only global datasets are used in the core, so the method works in any region.</P>
            <div className={cx(surface.flat, surface.radiusControl, 'min-w-0 overflow-x-auto')}>
              <table className={cx('w-full min-w-[720px] border-collapse text-left', tx.label)}>
                <caption className="sr-only">
                  Data sources: product, variable, units, resolution and time window
                </caption>
                <thead>
                  <tr className={tx.fg}>
                    {['Source', 'Product', 'Variable', 'Units', 'Resolution', 'Window'].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="border-b border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] p-2 font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={cx('font-normal', tx.fg2)}>
                  {SOURCE_ROWS.map((r) => (
                    <tr
                      key={`${r.source}-${r.variable}`}
                      className="border-b border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] last:border-b-0 align-top"
                    >
                      <th scope="row" className={cx('p-2 font-semibold', tx.fg)}>
                        {r.source}
                      </th>
                      <td className="p-2">{r.product}</td>
                      <td className="p-2">{r.variable}</td>
                      <td className="p-2">{r.units}</td>
                      <td className="p-2">{r.resolution}</td>
                      <td className="p-2">{r.window}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <P>
              If SMAP is unavailable, root-zone wetness may come from POWER GWETROOT instead. That value is MERRA-2
              model output, not a SMAP measurement, and is labelled that way.
            </P>
          </Section>

          <Section def={sectionDef('data-quality')}>
            <P>Every number in the tool carries one of four labels.</P>
            <dl className={cx('m-0 grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-4', tx.body)}>
              {QUALITY_ROWS.map((q) => (
                <div key={q.label} className="contents">
                  <dt className={cx('font-semibold', tx.fg)}>
                    <code className="font-mono">{q.label}</code>
                  </dt>
                  <dd className={cx('m-0 mb-2 sm:mb-0', tx.fg2)}>{q.meaning}</dd>
                </div>
              ))}
            </dl>
            <P>
              A missing value (null) means there was no observation. It is never treated or shown as zero: zero rain
              and no rain record are different things.
            </P>
            <P>
              The data mode (demo or observed) is shown on each field, together with the source and dates of the
              POWER, SMAP and MODIS values.
            </P>
          </Section>

          <Section def={sectionDef('limitations')}>
            <P>Read the results with these limits in mind.</P>
            <Bullets
              items={[
                <>
                  <strong className={tx.fg}>SMAP soil moisture is a 9 km cell.</strong> One value covers about 81
                  km², far larger than one field, so it cannot see differences between neighbouring fields.
                </>,
                <>
                  <strong className={tx.fg}>MODIS NDVI is a 250 m pixel.</strong> Small or narrow fields share a pixel
                  with roads, trees and neighbouring crops.
                </>,
                <>
                  <strong className={tx.fg}>NDVI comes as 16-day composites.</strong> Daily values are interpolated
                  between composites, so short events such as a quick harvest or a flood can be missed, and bare-soil
                  days are estimates.
                </>,
                <>
                  <strong className={tx.fg}>Field boundaries are hand-drawn demo polygons,</strong> not surveyed
                  parcels. NASA does not supply farm boundaries.
                </>,
                <>
                  <strong className={tx.fg}>Some fields are farmer input.</strong> The existing rotation, soil type,
                  irrigation level and market access are entered, not measured, and are not checked by the tool.
                </>,
                <>
                  <strong className={tx.fg}>Scoring thresholds are illustrative.</strong> Crop and scoring parameters
                  are marked validated: false until checked against local references, so treat scores as a
                  comparison aid, not a prediction.
                </>,
                <>
                  <strong className={tx.fg}>Scenario sliders are simulated, not forecasts.</strong> The rain and
                  temperature sliders rescale past years; they are not a NASA forecast or a climate projection.
                </>,
                <>
                  <strong className={tx.fg}>Demo mode uses synthetic data.</strong> When the data mode reads demo,
                  values are made up to show how the tool works and describe no real field.
                </>,
                <>
                  <strong className={tx.fg}>The Right now status is illustrative.</strong> It uses simple thresholds
                  on the last 30 days and is not an advisory.
                </>,
              ]}
            />
          </Section>

          <Section def={sectionDef('local-expertise')}>
            <P>
              Each rotation lists what needs local review. In general, check these with farmers, extension officers or
              agronomists before acting:
            </P>
            <Bullets
              items={[
                'Actual soil condition, from a soil test, rather than a 250 m SoilGrids estimate.',
                'Irrigation reliability, water rights and groundwater limits.',
                'Local market prices, contracts and access to buyers.',
                'Pest, disease and weed pressure in the area, and suitable crop varieties.',
                'Sowing and harvest windows for this season, labour and machinery.',
                'Any value that depends on a 9 km SMAP cell or a 250 m MODIS pixel.',
                'Scoring parameters that are still marked validated: false.',
              ]}
            />
          </Section>

          <Section def={sectionDef('disclaimer')}>
            <Disclaimer variant="card" />
            <P>
              The tool organises evidence so farmers and advisers can compare options. Decisions stay with the people
              who know the field.
            </P>
          </Section>
        </div>
      </div>
    </div>
  )
}
