import type { ReactNode } from 'react'
import { Layers, Mountain } from 'lucide-react'
import type { GeoProvider, FieldProfile } from '../../types/api'
import { Badge, Card } from '../../lib/ui4/primitives'
import { cx, fg, surface, tabular, type } from '../../lib/ui4/cls'
import { fmt, num } from './shared'
import { Term } from '../ui/Term'

const SAND = '#e9c46a'
const SILT = '#c08552'
const CLAY = '#8d5a3b'

function phNote(ph: number | null): string {
  if (ph === null) return 'not available'
  if (ph >= 8.5) return 'strongly alkaline: sodicity and micronutrient risk'
  if (ph >= 7.8) return 'moderately alkaline: watch zinc and phosphorus'
  if (ph >= 6.0) return 'near neutral: suits most crops'
  if (ph >= 5.5) return 'slightly acidic'
  return 'acidic: liming may be needed'
}

function slopeNote(s: number | null): string {
  if (s === null) return 'not available'
  if (s < 2) return 'flat: low erosion risk'
  if (s < 5) return 'gentle: contour or cover advised'
  if (s < 10) return 'moderate: erosion control needed'
  return 'steep: high erosion risk'
}

function Row({ label, value, note }: { label: ReactNode; value: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] py-2">
      <dt className={cx(type.label, fg.fg2)}>{label}</dt>
      <dd className="m-0 flex flex-col items-end text-right">
        <span className={cx('font-semibold', type.label, fg.fg, tabular)}>{value}</span>
        {note && <span className={cx('text-[12px]', fg.fg3)}>{note}</span>}
      </dd>
    </div>
  )
}

/** Soil (SoilGrids 0-30 cm, Saxton-Rawls water) and terrain (Copernicus DEM) for the pin. */
export default function SiteConditions({
  profile,
  texture,
  soilProvider,
  terrainProvider,
}: {
  profile: FieldProfile
  texture: string | null | undefined
  soilProvider?: GeoProvider
  terrainProvider?: GeoProvider
}) {
  const s = profile.soil
  const t = profile.terrain
  const sand = num(s.soil_sand_pct)
  const silt = num(s.soil_silt_pct)
  const clay = num(s.soil_clay_pct)
  const hasTexture = sand !== null && silt !== null && clay !== null
  const awc = num(s.soil_awc_m3m3)
  const ph = num(s.soil_ph)
  const slope = num(t.slope_deg)
  const elev = num(t.elevation_m)
  const fc = num(s.soil_field_capacity_m3m3)
  const wp = num(s.soil_wilting_point_m3m3)
  const soc = num(s.soil_soc_g_kg)
  const hasSoil = hasTexture || awc !== null || ph !== null || soc !== null
  const hasTerrain = slope !== null || elev !== null
  // No data, no card: a source that returned nothing is listed under "Data and limits" instead.
  if (!hasSoil && !hasTerrain) return null

  return (
    <div className={cx('grid gap-4', hasSoil && hasTerrain && 'lg:grid-cols-2')}>
      {hasSoil && (
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <Layers size={20} aria-hidden="true" /> Soil
          </span>
        }
        actions={texture ? <Badge tone="accent">{texture}</Badge> : undefined}
      >
        {hasTexture && (
            <div className="flex flex-col gap-2">
              <div
                role="img"
                aria-label={`Texture: sand ${sand!.toFixed(0)}%, silt ${silt!.toFixed(0)}%, clay ${clay!.toFixed(0)}%`}
                className="flex h-6 w-full gap-[2px] overflow-hidden rounded-full"
              >
                <div style={{ flexGrow: sand!, background: SAND }} />
                <div style={{ flexGrow: silt!, background: SILT }} />
                <div style={{ flexGrow: clay!, background: CLAY }} />
              </div>
              <div className={cx('flex justify-between', type.label, fg.fg2, tabular)}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SAND }} aria-hidden="true" /> Sand {sand!.toFixed(0)}%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SILT }} aria-hidden="true" /> Silt {silt!.toFixed(0)}%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLAY }} aria-hidden="true" /> Clay {clay!.toFixed(0)}%
                </span>
              </div>
            </div>
        )}
        <dl className="m-0">
          {awc !== null && (
            <Row label="Water the soil holds for plants" value={`${Math.round(awc * 1000)} mm per metre`} note="of root depth (Saxton & Rawls 2006)" />
          )}
          {fc !== null && wp !== null && (
            <Row label="Full / dry point" value={`${fmt(fc, 2)} / ${fmt(wp, 2)} m³/m³`} note="field capacity / wilting point" />
          )}
          {ph !== null && <Row label="pH" value={fmt(ph, 1)} note={phNote(ph)} />}
          {soc !== null && (
            <Row
              label="Organic carbon"
              value={`${fmt(soc, 1)} g/kg`}
              note={num(s.soil_om_pct) !== null ? `≈ ${fmt(s.soil_om_pct, 1)}% organic matter` : undefined}
            />
          )}
        </dl>
        <p className={cx('m-0 text-[12px]', fg.fg3)}>
          ISRIC SoilGrids v2.0, 0 to 30 cm, 250 m modelled estimate (one value per <Term id="grid_cell">grid cell</Term>)
          {soilProvider?.sample_note && soilProvider.sample_note !== 'exact point' ? ` (${soilProvider.sample_note})` : ''}.
        </p>
      </Card>
      )}

      {hasTerrain && (
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <Mountain size={20} aria-hidden="true" /> Terrain
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          {elev !== null && (
          <div className={cx(surface.flat, 'flex flex-col p-3')}>
            <span className={cx(type.label, fg.fg3)}>Height above sea</span>
            <span className={cx('text-[24px] font-semibold', tabular, fg.fg)}>
              {fmt(t.elevation_m)}
              <span className={cx(type.label, 'font-normal', fg.fg3)}> m</span>
            </span>
          </div>
          )}
          {slope !== null && (
          <div className={cx(surface.flat, 'flex flex-col p-3')}>
            <span className={cx(type.label, fg.fg3)}>Slope</span>
            <span className={cx('text-[24px] font-semibold', tabular, fg.fg)}>
              {fmt(slope, 1)}
              <span className={cx(type.label, 'font-normal', fg.fg3)}>°</span>
            </span>
          </div>
          )}
        </div>
        <dl className="m-0">
          {slope !== null && <Row label={<Term id="erosion_risk">Erosion outlook</Term>} value={slopeNote(slope).split(':')[0]} note={slopeNote(slope).split(':')[1]?.trim()} />}
          {num(terrainProvider?.local_relief_m) !== null && (
            <Row label="Local relief (≈330 m window)" value={`${fmt(terrainProvider!.local_relief_m, 1)} m`} />
          )}
        </dl>
        <p className={cx('m-0 text-[12px]', fg.fg3)}>
          Copernicus DEM GLO-30. Slope is a plane fitted over about 330 m, so field-scale terraces and bunds are not resolved.
        </p>
      </Card>
      )}
    </div>
  )
}
