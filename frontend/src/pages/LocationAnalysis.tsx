import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CloudSun,
  Database,
  Layers,
  ListOrdered,
  Loader2,
  MapPin,
  RefreshCw,
  Satellite,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { api } from '../api/client'
import Disclaimer from '../components/Disclaimer'
import FarmInputsPanel from '../components/inputs/FarmInputsPanel'
import ScoreRadar from '../components/ScoreRadar'
import ClimatePanel from '../components/results/ClimatePanel'
import DataSourcesPanel from '../components/results/DataSourcesPanel'
import FarmYearCard, { NdviStatusNote } from '../components/results/FarmYearCard'
import FieldRiskMap from '../components/results/FieldRiskMap'
import KpiGrid from '../components/results/KpiGrid'
import NowPanel from '../components/results/NowPanel'
import RecommendationHero from '../components/results/RecommendationHero'
import RotationDetail from '../components/results/RotationDetail'
import RotationLeaderboard from '../components/results/RotationLeaderboard'
import SiteConditions from '../components/results/SiteConditions'
import WaterBalanceChart from '../components/results/WaterBalanceChart'
import { ResultSection, useDebounced } from '../components/results/shared'
import { Badge, Card } from '../lib/ui4/primitives'
import { cx, fg, surface, tabular, type } from '../lib/ui4/cls'
import { useFarmInputs } from '../hooks/useFarmInputs'
import { useNdviPolling } from '../hooks/useNdviPolling'
import { DEFAULT_INPUTS, toConstraints, toPriorities, toScenario } from '../store/farmInputs'
import type { LocationCompareResponse, RotationScore } from '../types/api'

const fieldCls =
  'min-h-[44px] w-full rounded-[var(--radius-control,1rem)] border border-[color:var(--color-control-border,rgba(190,242,220,0.45))] bg-[rgba(0,0,0,0.25)] pl-3 pr-10 text-[color:var(--color-fg,#ecfdf3)]'

type Irrigation = 'none' | 'limited' | 'reliable'

const IRRIGATION: { v: Irrigation; label: string }[] = [
  { v: 'none', label: 'None (rain only)' },
  { v: 'limited', label: 'Limited' },
  { v: 'reliable', label: 'Reliable' },
]

const NAV = [
  { id: 'res-summary', label: 'Summary', icon: Sparkles },
  { id: 'res-year', label: 'Year', icon: CalendarDays },
  { id: 'res-compare', label: 'Compare', icon: ListOrdered },
  { id: 'res-details', label: 'Details', icon: BarChart3 },
  { id: 'res-climate', label: 'Climate', icon: CloudSun },
  { id: 'res-site', label: 'Site', icon: Layers },
  { id: 'res-data', label: 'Data', icon: Database },
]

/** Landscape photo behind the glass, portalled to <body> so position:fixed is not trapped by animated wrappers. */
function PhotoBackdrop() {
  return createPortal(<div className="photo-backdrop" aria-hidden="true" />, document.body)
}

function SectionNav() {
  return (
    <nav
      aria-label="Results sections"
      className={cx(surface.glass, 'sticky top-[64px] z-20 flex gap-1 overflow-x-auto p-1.5 md:top-3')}
    >
      {NAV.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          className={cx(
            'inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-[calc(var(--radius-card,1.5rem)-6px)] px-3 font-semibold no-underline',
            type.label,
            'text-[color:var(--color-fg-2,#b4cfc0)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--color-fg,#ecfdf3)]',
          )}
        >
          <Icon size={16} aria-hidden="true" />
          {label}
        </a>
      ))}
    </nav>
  )
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className={cx(surface.glass, 'h-[220px] animate-pulse')} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={cx(surface.glass, 'h-[120px] animate-pulse')} />
        ))}
      </div>
      <div className={cx(surface.glass, 'h-[320px] animate-pulse')} />
    </div>
  )
}

function EmptyState() {
  const steps = [
    { icon: Satellite, title: '20+ years of NASA POWER', text: 'Daily rain, temperature, humidity, wind and solar radiation for this grid cell.' },
    { icon: Layers, title: 'Soil and terrain', text: 'SoilGrids texture and water holding, Copernicus DEM slope and elevation.' },
    { icon: ListOrdered, title: 'Ranked rotations', text: 'Your rotation against regional alternatives, with reasons, risks and evidence.' },
  ]
  return (
    <div className={cx(surface.glass, 'flex flex-col gap-6 p-6 md:p-8')}>
      <div className="flex flex-col gap-2">
        <h2 className={cx('m-0', type.heading, fg.fg)}>Choose your rotation to start</h2>
        <p className={cx('m-0 max-w-[62ch]', type.body, fg.fg2)}>
          Pick the rotation you grow now and your irrigation, then run the analysis. Everything below is computed live for this
          exact point.
        </p>
      </div>
      <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className={cx(surface.flat, 'flex flex-col gap-2 p-4')}>
            <span className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(74,222,128,0.16)] text-[color:var(--color-accent,#4ade80)]">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className={cx(type.label, fg.fg3)}>Step {i + 1}</span>
            </span>
            <span className={cx('font-semibold', type.body, fg.fg)}>{title}</span>
            <span className={cx(type.label, fg.fg2)}>{text}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Saved-field context: size, and what the best and current rotations would sell for on this exact area. */
function FieldBanner({
  name,
  areaHa,
  best,
  current,
  incomeScored,
}: {
  name: string | null
  areaHa: number
  best: RotationScore | undefined
  current: RotationScore | undefined
  incomeScored: boolean
}) {
  const money = (v: number | null | undefined) =>
    typeof v === 'number' ? `$${Math.round(v * areaHa).toLocaleString()}` : null
  const bestSales = incomeScored ? money(best?.annual_value_usd_ha) : null
  const curSales = incomeScored ? money(current?.annual_value_usd_ha) : null
  return (
    <div className={cx(surface.glass, 'flex flex-wrap items-center gap-x-6 gap-y-2 p-4')}>
      <span className="flex items-center gap-2">
        <MapPin size={18} aria-hidden="true" className={fg.accent} />
        <span className={cx('font-semibold', type.body, fg.fg)}>{name || 'Your field'}</span>
      </span>
      <span className={cx(type.label, fg.fg2, tabular)}>
        {areaHa.toLocaleString(undefined, { maximumFractionDigits: 2 })} ha · {(areaHa * 2.4710538).toLocaleString(undefined, { maximumFractionDigits: 2 })} acres
      </span>
      {bestSales && best && (
        <span className={cx(type.label, fg.fg2)}>
          Expected crop sales on this field: <strong className={fg.fg}>{bestSales}/yr</strong> with {best.label}
          {curSales && current && current.rotation_id !== best.rotation_id ? ` vs ${curSales}/yr now` : ''} (FAOSTAT prices, before costs)
        </span>
      )}
      {!incomeScored && best && (
        <span className={cx(type.label, fg.fg3)}>No crop-sales estimate: FAOSTAT has no current prices for some crops here.</span>
      )}
    </div>
  )
}

export default function LocationAnalysis() {
  const [params] = useSearchParams()
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  const validCoords =
    params.get('lat') !== null &&
    params.get('lon') !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180

  // A saved field opens here with ?field=&name=&area_ha=&irrigation=&rotation= and runs straight away.
  const qIrr = params.get('irrigation')
  const initIrr: Irrigation = qIrr === 'none' || qIrr === 'limited' || qIrr === 'reliable' ? qIrr : 'limited'
  const initRot = params.get('rotation') ?? ''
  const fieldName = params.get('name')
  const fieldAreaHa = Number(params.get('area_ha'))
  const hasField = params.get('field') !== null && Number.isFinite(fieldAreaHa) && fieldAreaHa > 0
  const urlAreaHa = Number.isFinite(fieldAreaHa) && fieldAreaHa > 0 ? fieldAreaHa : null
  const [irrigation, setIrrigation] = useState<Irrigation>(initIrr)
  const [rotationId, setRotationId] = useState(initRot)
  const [submitted, setSubmitted] = useState<{ rotationId: string; irrigation: Irrigation } | null>(
    initRot ? { rotationId: initRot, irrigation: initIrr } : null,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const { inputs, update, setInputs } = useFarmInputs()

  const region = useQuery({
    queryKey: ['location-region', lat, lon],
    queryFn: () => api.locationRegion(lat, lon),
    enabled: validCoords,
    retry: false,
  })
  const regionRotations = region.data?.rotations ?? []

  // Farm inputs re-score live: cached NASA data makes a re-score ~0.4 s and it does not count against the rate limit.
  const liveRequest = useMemo(
    () => ({
      priorities: toPriorities(inputs.goals),
      scenario: toScenario(inputs),
      constraints: toConstraints(inputs, urlAreaHa),
    }),
    [inputs, urlAreaHa],
  )
  const requestKey = useDebounced(JSON.stringify(liveRequest), 600)
  const farmRequest = useMemo(() => JSON.parse(requestKey) as typeof liveRequest, [requestKey])

  const compare = useQuery({
    queryKey: ['location-compare', lat, lon, submitted, requestKey],
    queryFn: () =>
      api.compareLocation({
        location: { lat, lon },
        irrigation: submitted!.irrigation,
        current_rotation_id: submitted!.rotationId,
        ...farmRequest,
      }),
    enabled: validCoords && submitted !== null,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 5 * 60_000,
  })

  const data: LocationCompareResponse | undefined = compare.data
  const ranked = useMemo(() => [...(data?.rotations ?? [])].sort((a, b) => a.rank - b.rank), [data])
  const current = ranked.find((r) => r.is_existing)

  // Shortlist: current rotation + best fitting option of each kind. Older backends send no shortlist: show all.
  const hasShortlist = ranked.some((r) => typeof r.shortlisted === 'boolean') && ranked.some((r) => r.shortlisted)
  const shortlist = hasShortlist ? ranked.filter((r) => r.shortlisted) : ranked
  const visible = showAll ? ranked : shortlist
  const canToggle = hasShortlist && shortlist.length < ranked.length
  const best = visible.find((r) => r.fits_constraints !== false) ?? visible[0]
  const selected = visible.find((r) => r.rotation_id === selectedId) ?? best
  const yearAlternative =
    selected && !selected.is_existing ? selected : visible.find((r) => !r.is_existing && r.fits_constraints !== false)

  const refetchCompare = compare.refetch
  const onNdviReady = useCallback(() => {
    void refetchCompare()
  }, [refetchCompare])
  const ndvi = useNdviPolling(lat, lon, data?.data_retrieval.ndvi, onNdviReady)
  // Greenness row uses farm_year[].ndvi only (filled by the backend from real MODIS data), no site-level fallback.
  const ndviSummary = null
  const rainMean = data?.profile.climatology.rain_annual_mm_mean
  const annualRainMm = typeof rainMean === 'number' && Number.isFinite(rainMean) ? rainMean : null
  const incomeNote = data?.income_status && !data.income_status.scored ? data.income_status.note : null

  const dirty = submitted !== null && (submitted.rotationId !== rotationId || submitted.irrigation !== irrigation)
  const firstLoad = compare.isFetching && !data
  const refreshing = compare.isFetching && !!data

  const openDetails = (id: string) => {
    setSelectedId(id)
    document.getElementById('res-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const back = (
    <Link
      to="/"
      className="inline-flex items-center gap-2 font-semibold text-[var(--color-accent,#4ADE80)] no-underline hover:underline"
    >
      <ArrowLeft size={16} aria-hidden /> Back to map
    </Link>
  )

  if (!validCoords) {
    return (
      <div className="photo-scope flex flex-col gap-4 py-4">
        <PhotoBackdrop />
        <h1 className={cx('m-0', type.heading, fg.fg)}>No location selected</h1>
        <p className={cx('m-0', type.body, fg.fg2)}>Pick a point on the map first (use GPS, search, or click the map).</p>
        {back}
      </div>
    )
  }

  return (
    <div className="photo-scope flex flex-col gap-6 py-2">
      <PhotoBackdrop />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          {back}
          <h1 id="page-title" tabIndex={-1} className={cx('m-0 outline-none', type.display, fg.fg, 'text-[32px] md:text-[40px]')}>
            Location analysis
          </h1>
          <p className={cx('m-0 flex flex-wrap items-center gap-2', type.body, fg.fg2)}>
            <MapPin size={16} aria-hidden="true" className={fg.accent} />
            {lat.toFixed(5)}, {lon.toFixed(5)}
            {region.data && <span className={fg.fg3}>· {region.data.region_name}</span>}
          </p>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent" icon={Satellite}>
              Live NASA data
            </Badge>
            <Badge tone="neutral">
              {data.profile.n_years} years · {data.data_retrieval.source === 'cache' ? 'cached' : 'just fetched'}
            </Badge>
            {data.scenario_applied && <Badge tone="warn">"What if" weather</Badge>}
            {ndvi.polling && <NdviStatusNote status={ndvi.status} polling />}
            {refreshing && (
              <Badge tone="info" icon={Loader2}>
                Updating
              </Badge>
            )}
          </div>
        )}
      </header>

      {hasField && (
        <FieldBanner name={fieldName} areaHa={fieldAreaHa} best={best} current={current} incomeScored={!!data?.income_status?.scored} />
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* ---------------------------------------------------------------- controls */}
        <aside className="flex min-w-0 flex-col gap-4">
          <Card title="About your field">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (!rotationId) return
                const next = { rotationId, irrigation }
                if (submitted && !dirty) compare.refetch()
                else setSubmitted(next)
              }}
            >
              <label className={cx('flex flex-col gap-1', type.label, fg.fg2)}>
                Current rotation
                <select
                  className={fieldCls}
                  value={rotationId}
                  onChange={(e) => setRotationId(e.target.value)}
                  required
                  disabled={region.isLoading || regionRotations.length === 0}
                >
                  <option value="">
                    {region.isLoading ? 'Loading…' : region.isError ? 'Rotations unavailable' : 'Select your current rotation'}
                  </option>
                  {regionRotations.map((r) => (
                    <option key={r.rotation_id} value={r.rotation_id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <span className={cx('text-[12px]', fg.fg3)}>
                  {region.data ? `Rotations for ${region.data.region_name}.` : 'Rotations for the region that contains this point.'}
                </span>
              </label>
              <label className={cx('flex flex-col gap-1', type.label, fg.fg2)}>
                Irrigation
                <select className={fieldCls} value={irrigation} onChange={(e) => setIrrigation(e.target.value as Irrigation)}>
                  {IRRIGATION.map((i) => (
                    <option key={i.v} value={i.v}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={!rotationId || compare.isFetching}
                className={cx(
                  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[var(--radius-control,1rem)] px-5 font-semibold',
                  'bg-[color:var(--color-accent,#4ade80)] text-[#06240f] hover:brightness-110 active:scale-[0.98] disabled:opacity-50',
                )}
              >
                {compare.isFetching ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                ) : submitted ? (
                  <RefreshCw size={18} aria-hidden />
                ) : (
                  <Sparkles size={18} aria-hidden />
                )}
                {firstLoad ? 'Fetching NASA data…' : submitted ? (dirty ? 'Apply changes' : 'Run again') : 'Analyze this location'}
              </button>
              {dirty && (
                <p className={cx('m-0', type.label, fg.demo)} role="status">
                  Field details changed. Apply to update the results.
                </p>
              )}
              {firstLoad && (
                <p className={cx('m-0', type.label, fg.fg3)} role="status">
                  The first request for an area downloads about 20 years of NASA POWER data and can take 10 to 30 seconds.
                </p>
              )}
            </form>
          </Card>

          <FarmInputsPanel
            inputs={inputs}
            update={update}
            reset={() => setInputs(DEFAULT_INPUTS)}
            urlAreaHa={urlAreaHa}
            irrigationLabel={IRRIGATION.find((i) => i.v === irrigation)?.label ?? irrigation}
            annualRainMm={annualRainMm}
            incomeNote={incomeNote}
            scenarioApplied={data?.scenario_applied}
            live={submitted !== null}
          />
        </aside>

        {/* ----------------------------------------------------------------- results */}
        <div className="flex min-w-0 flex-col gap-8">
          {region.error && (
            <div role="alert" className={cx(surface.glass, 'flex items-start gap-3 p-4')}>
              <TriangleAlert size={20} aria-hidden className={cx('mt-0.5 shrink-0', fg.danger)} />
              <div className="flex flex-col gap-2">
                <p className={cx('m-0 font-semibold', fg.fg)}>Could not load rotations for this location</p>
                <p className={cx('m-0', type.label, fg.fg2)}>
                  {(region.error as Error).message === 'Failed to fetch'
                    ? 'Cannot reach the API (network or CORS error). Check that the backend is running and allows this origin.'
                    : (region.error as Error).message}
                </p>
                <button
                  type="button"
                  onClick={() => region.refetch()}
                  className="inline-flex min-h-[44px] items-center self-start rounded-[var(--radius-control,1rem)] border px-4 font-semibold"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {compare.error && (
            <div role="alert" className={cx(surface.glass, 'flex items-start gap-3 p-4')}>
              <TriangleAlert size={20} aria-hidden className={cx('mt-0.5 shrink-0', fg.danger)} />
              <div>
                <p className={cx('m-0 font-semibold', fg.fg)}>Could not analyze this location</p>
                <p className={cx('m-0', type.label, fg.fg2)}>{(compare.error as Error).message}</p>
              </div>
            </div>
          )}

          {!submitted && !region.error && <EmptyState />}
          {firstLoad && <ResultsSkeleton />}

          {data && selected && (
            <div
              className={cx('flex flex-col gap-8 transition-opacity motion-safe:duration-200', refreshing && 'opacity-70')}
              aria-busy={refreshing}
            >
              <SectionNav />

              <ResultSection
                id="res-summary"
                title="Summary"
                subtitle={`${data.location.region_name} · NASA POWER ${data.data_retrieval.period_start.slice(0, 4)} to ${data.data_retrieval.period_end.slice(0, 4)}`}
              >
                <RecommendationHero
                  best={best}
                  current={current}
                  total={data.total_candidates ?? ranked.length}
                  onDetails={openDetails}
                />
                <KpiGrid profile={data.profile} />
              </ResultSection>

              {ranked.some((r) => r.farm_year?.length === 12) && (
                <ResultSection
                  id="res-year"
                  title="Your farm's year"
                  subtitle="Month by month: what grows, when the soil is bare, and when weather risks hit."
                >
                  <FarmYearCard
                    current={current}
                    alternative={yearAlternative}
                    options={visible}
                    onPickAlternative={setSelectedId}
                    ndviFallback={ndviSummary}
                    ndviStatus={ndvi.status}
                    ndviPolling={ndvi.polling}
                  />
                </ResultSection>
              )}

              <ResultSection
                id="res-compare"
                title="Compare rotations"
                subtitle={
                  hasShortlist && !showAll
                    ? 'Your shortlist: your current rotation and the best option of each kind that fits your farm. Select a row for details.'
                    : 'Select a row to open its full assessment. Scores follow the order of what matters most to you.'
                }
              >
                <RotationLeaderboard
                  rotations={visible}
                  selectedId={selected.rotation_id}
                  onSelect={openDetails}
                  showAll={canToggle ? showAll : undefined}
                  onToggleAll={canToggle ? () => setShowAll((v) => !v) : undefined}
                  totalCount={data.total_candidates ?? ranked.length}
                />
                <div className="grid gap-4 2xl:grid-cols-2">
                  <ScoreRadar rotations={visible} />
                  <WaterBalanceChart rotations={visible} />
                </div>
              </ResultSection>

              <ResultSection id="res-details" title="Rotation details" subtitle="Why, benefits, risks, data gaps and evidence.">
                <RotationDetail key={selected.rotation_id} rotation={selected} />
              </ResultSection>

              <ResultSection
                id="res-climate"
                title="Climate at this location"
                subtitle={`Long-term monthly means over ${data.profile.n_years} complete years.`}
              >
                <ClimatePanel profile={data.profile} />
              </ResultSection>

              <ResultSection id="res-site" title="Site conditions" subtitle="Soil, terrain and the last 30 days.">
                <FieldRiskMap
                  data={data}
                  rotationId={current?.rotation_id ?? submitted?.rotationId}
                  fieldId={params.get('field')}
                  areaHa={hasField ? fieldAreaHa : null}
                />
                <SiteConditions
                  profile={data.profile}
                  texture={data.location.soil_texture_class}
                  soilProvider={data.data_retrieval.geospatial?.soil}
                  terrainProvider={data.data_retrieval.geospatial?.terrain}
                />
                <NowPanel status={data.now_status} reasons={data.now_reasons} now={data.profile.now} />
              </ResultSection>

              <ResultSection id="res-data" title="Data and limits">
                <DataSourcesPanel data={data} />
              </ResultSection>

              <Disclaimer variant="inline" text={data.disclaimer} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
