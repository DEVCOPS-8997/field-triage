import { ChevronDown, Database, Loader2, TriangleAlert } from 'lucide-react'
import type { LocationCompareResponse, Quality } from '../../types/api'
import { Badge } from '../../lib/ui4/primitives'
import { cx, fg, surface, type } from '../../lib/ui4/cls'
import { Term } from '../ui/Term'
import SatelliteVsGround from './SatelliteVsGround'

const SOURCE_NAME: Record<string, string> = {
  power: 'NASA POWER climate',
  eto: 'Reference ET (FAO-56)',
  gwetroot: 'Root-zone wetness',
  soil: 'SoilGrids soil',
  terrain: 'Copernicus DEM terrain',
  smap: 'SMAP soil moisture',
  modis: 'MODIS NDVI greenness (250 m)',
  rotation_scores: 'Rotation scores',
  faostat: 'FAOSTAT yields and prices',
}

const TONE: Record<Quality, 'accent' | 'info' | 'warn' | 'neutral'> = {
  observed: 'accent',
  derived: 'info',
  unavailable: 'neutral',
  demo: 'warn',
}

/** Where every number came from, and what the analysis cannot see. Collapsed by default. */
export default function DataSourcesPanel({ data }: { data: LocationCompareResponse }) {
  const dr = data.data_retrieval
  const cell = data.location.nasa_grid_cell
  // Only sources that actually fed this analysis; anything that returned nothing is a "data limit" instead.
  const used = Object.entries(data.data_quality).filter(([, q]) => q !== 'unavailable')
  // MODIS NDVI is merged into the profile after the first answer; list it once it is in.
  const modisMerged = data.profile?.data_quality?.modis === 'observed'
  if (modisMerged && !used.some(([k]) => k === 'modis')) used.push(['modis', 'observed'])
  const ndvi = dr.ndvi
  const ndviRunning = ndvi?.state === 'running' && !modisMerged
  const income = data.income_status
  return (
    <div className="flex flex-col gap-3">
      {data.warnings.length > 0 && (
        <div className={cx(surface.glass, 'flex flex-col gap-2 border-l-4 border-l-[color:var(--color-demo,#fbbf24)] p-4')}>
          <span className={cx('flex items-center gap-2 font-semibold', type.body, fg.fg)}>
            <TriangleAlert size={18} aria-hidden="true" className={fg.demo} />
            Data limits ({data.warnings.length})
          </span>
          <ul className={cx('m-0 flex flex-col gap-1 pl-5', type.label, fg.fg2)}>
            {data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <details className={cx(surface.glass, 'group p-4')}>
        <summary className={cx('flex cursor-pointer list-none items-center gap-2 font-semibold', type.body, fg.fg)}>
          <Database size={18} aria-hidden="true" className={fg.accent} />
          Data sources and provenance
          <ChevronDown size={18} aria-hidden="true" className="ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {used.map(([k, q]) => (
              <Badge key={k} tone={TONE[q] ?? 'neutral'} title={`${SOURCE_NAME[k] ?? k}: ${q}`}>
                {SOURCE_NAME[k] ?? k}: {q}
              </Badge>
            ))}
            {ndviRunning && (
              <span role="status" className={cx('inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-2 font-semibold', type.label, fg.fg2, 'border-[color:var(--color-glass-border,rgba(190,242,220,0.3))]')}>
                <Loader2 size={14} aria-hidden="true" className="motion-safe:animate-spin" />
                MODIS NDVI: downloading
              </span>
            )}
          </div>
          <dl className={cx('m-0 grid gap-x-6 gap-y-2 md:grid-cols-2', type.label)}>
            <div>
              <dt className={fg.fg3}>NASA POWER record</dt>
              <dd className={cx('m-0', fg.fg2)}>
                {dr.period_start} to {dr.period_end}, {dr.source === 'cache' ? 'served from local cache' : 'fetched live'} on{' '}
                {dr.fetched_at.slice(0, 10)}
                {dr.stale ? ' (stale)' : ''}
              </dd>
            </div>
            {cell && (
              <div>
                <dt className={fg.fg3}>
                  Climate <Term id="grid_cell">grid cell</Term>
                </dt>
                <dd className={cx('m-0', fg.fg2)}>
                  {cell.size_deg}° cell centred at {cell.center_lat}, {cell.center_lon}
                </dd>
              </div>
            )}
            {dr.power_parameters && (
              <div className="md:col-span-2">
                <dt className={fg.fg3}>POWER parameters</dt>
                <dd className={cx('m-0 font-mono text-[12px]', fg.fg2)}>{dr.power_parameters.join(', ')}</dd>
              </div>
            )}
            {(modisMerged || ndviRunning) && (
              <div>
                <dt className={fg.fg3}>
                  Vegetation <Term id="ndvi">NDVI</Term>
                </dt>
                <dd className={cx('m-0', fg.fg2)}>
                  {modisMerged
                    ? `MODIS 250 m, 16-day composites${
                        ndvi?.summary?.period_start && ndvi.summary.period_end
                          ? `, ${ndvi.summary.period_start.slice(0, 4)} to ${ndvi.summary.period_end.slice(0, 4)}`
                          : ''
                      }${ndvi?.summary?.n_composites_good ? ` (${ndvi.summary.n_composites_good} clear images)` : ''}${
                        ndvi?.provider || ndvi?.summary?.provider ? `, via ${ndvi.provider ?? ndvi.summary?.provider}` : ''
                      }.`
                    : `Downloading MODIS satellite greenness for this spot${ndvi?.elapsed_s ? ` (${Math.round(ndvi.elapsed_s)} s so far)` : ''}. The charts update when it arrives.`}
                </dd>
              </div>
            )}
            {(['soil', 'terrain'] as const).map((k) => {
              const p = dr.geospatial?.[k]
              if (!p || p.status !== 'available') return null
              return (
                <div key={k}>
                  <dt className={fg.fg3}>{k === 'soil' ? 'Soil' : 'Terrain'}</dt>
                  <dd className={cx('m-0', fg.fg2)}>
                    {`${p.product ?? p.provider}, ${p.spatial_resolution ?? ''}. ${p.quality ?? ''}`}
                  </dd>
                </div>
              )
            })}
            {income && (
              <div className="md:col-span-2">
                <dt className={fg.fg3}>Crop income</dt>
                <dd className={cx('m-0', fg.fg2)}>
                  {income.note}
                  {income.scored && income.source_url && (
                    <>
                      {' '}
                      <a href={income.source_url} target="_blank" rel="noreferrer" className="underline">
                        {income.source}
                      </a>
                      {income.retrieved_at ? `, downloaded ${income.retrieved_at}` : ''}.
                    </>
                  )}
                </dd>
              </div>
            )}
          </dl>
          <p className={cx('m-0', type.label, fg.fg3)}>{data.location.data_resolution_note}</p>
        </div>
      </details>
      <SatelliteVsGround data={data} tone="glass" />
    </div>
  )
}
