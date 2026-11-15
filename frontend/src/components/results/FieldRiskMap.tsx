import { useEffect, useId, useMemo } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Polygon, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { ShieldAlert } from 'lucide-react'
import type { LocationCompareResponse } from '../../types/api'
import { useMyField } from '../../api/account'
import { EROSION_STYLE, HEAVY_RAIN_MONTHLY_MM, erosionRisk, type ErosionLevel, type ErosionRisk } from '../../lib/erosion'
import { Card } from '../../lib/ui4/primitives'
import { cx, fg, type } from '../../lib/ui4/cls'
import { Term } from '../ui/Term'

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const CASING = 'rgba(4,18,10,0.85)'
const GLYPH: Record<ErosionLevel, string> = { low: '●', medium: '◆', high: '▲' }

/** Small swatch: colour + the same dash pattern used on the map, so level is never colour alone. */
function Swatch({ level }: { level: ErosionLevel }) {
  const s = EROSION_STYLE[level]
  return (
    <svg width="28" height="16" viewBox="0 0 28 16" aria-hidden="true" className="shrink-0">
      <rect x="2" y="2" width="24" height="12" rx="3" fill={s.fill} fillOpacity="0.3" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashArray?.replace(/\d+/g, (n) => String(Math.max(2, Math.round(Number(n) / 2))))} />
    </svg>
  )
}

/**
 * Legend for erosion-coloured fields. With `risk`, also states this field's level and reason.
 * Exported so FieldMap (and any other map) can show the same legend.
 */
export function ErosionLegend({ risk, className }: { risk?: ErosionRisk | null; className?: string }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-2', className)}>
      {risk && (
        <p className={cx('m-0 font-semibold', type.label, fg.fg)}>
          <Term id="erosion_risk">Erosion risk</Term> for your current rotation:{' '}
          <span style={{ color: EROSION_STYLE[risk.level].color }}>
            <span aria-hidden="true">{GLYPH[risk.level]} </span>
            {risk.summary}
          </span>
        </p>
      )}
      <ul aria-label="Erosion risk legend" className={cx('m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0', type.label, fg.fg2)}>
        {(['low', 'medium', 'high'] as const).map((lv) => (
          <li key={lv} className={cx('inline-flex items-center gap-2', risk?.level === lv && 'font-semibold text-[color:var(--color-fg,#ecfdf3)]')}>
            <Swatch level={lv} />
            <span aria-hidden="true">{GLYPH[lv]}</span>
            {EROSION_STYLE[lv].label}
            {lv === 'low' ? ' (solid line)' : lv === 'medium' ? ' (long dashes)' : ' (short dashes)'}
          </li>
        ))}
      </ul>
    </div>
  )
}

const labelIcon = (level: ErosionLevel) =>
  L.divIcon({
    className: 'fsa-erosion-label',
    html: `<span style="display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;padding:2px 8px;border-radius:9999px;background:rgba(4,18,10,0.88);color:${EROSION_STYLE[level].color};font:700 12px/1.4 system-ui,sans-serif;border:1.5px solid ${EROSION_STYLE[level].color}">${GLYPH[level]} ${EROSION_STYLE[level].label} erosion risk</span>`,
    iconSize: [0, 0],
  })

function Fit({ ring, center, radius }: { ring: [number, number][] | null; center: [number, number]; radius: number }) {
  const map = useMap()
  const [lat, lon] = center
  useEffect(() => {
    if (ring && ring.length > 2) map.fitBounds(L.latLngBounds(ring), { padding: [32, 32], maxZoom: 18, animate: false })
    else map.fitBounds(L.latLng(lat, lon).toBounds(radius * 3), { animate: false, maxZoom: 17 })
  }, [map, ring, lat, lon, radius])
  return null
}

export interface FieldRiskMapProps {
  data: LocationCompareResponse
  /** Rotation to judge (the farmer's current one). Defaults to the rotation marked is_existing. */
  rotationId?: string | null
  /** Saved field id (the `field` URL param). When the user is signed in, its drawn outline is used. */
  fieldId?: string | number | null
  /** Field area in hectares (the `area_ha` URL param); draws an equal-area circle when no outline is known. */
  areaHa?: number | null
  className?: string
}

/**
 * The analysed field on a small satellite map, outlined and filled by erosion risk for the current
 * rotation, with a text legend (colour + dash pattern + label). Self-contained: fetches the saved
 * outline itself; falls back to a circle / pin at the analysed point.
 */
export default function FieldRiskMap({ data, rotationId, fieldId, areaHa, className }: FieldRiskMapProps) {
  const titleId = useId()
  const risk = useMemo(() => erosionRisk(data, rotationId), [data, rotationId])
  const numericId = fieldId !== null && fieldId !== undefined && /^\d+$/.test(String(fieldId)) ? Number(fieldId) : null
  const saved = useMyField(numericId)

  const center: [number, number] = [data.location.lat, data.location.lon]
  const ring = useMemo<[number, number][] | null>(() => {
    const coords = saved.data?.geojson?.coordinates?.[0]
    return coords && coords.length > 3 ? coords.map(([lon, lat]) => [lat, lon] as [number, number]) : null
  }, [saved.data])
  const radius = areaHa && areaHa > 0 ? Math.sqrt((areaHa * 10_000) / Math.PI) : 60

  if (!risk) return null
  const st = EROSION_STYLE[risk.level]
  const path = { color: st.color, weight: st.weight, dashArray: st.dashArray, fillColor: st.fill, fillOpacity: 0.3 }
  const shapeNote = ring
    ? 'Your saved field outline.'
    : areaHa && areaHa > 0
      ? 'Circle the size of your field around the analysed point (draw the outline in My fields for the exact shape).'
      : 'Analysed point. Save the field in My fields to see its outline here.'

  return (
    <Card
      titleId={titleId}
      title={
        <span className="inline-flex items-center gap-2">
          <ShieldAlert size={20} aria-hidden="true" /> Erosion risk on your field
        </span>
      }
      className={className}
    >
      <div
        role="img"
        aria-label={`Map of your field coloured by erosion risk: ${risk.summary}.`}
        className="relative isolate h-[240px] w-full min-w-0 overflow-hidden rounded-[var(--radius-control,1rem)] md:h-[280px]"
      >
        <MapContainer
          center={center}
          zoom={16}
          maxZoom={18}
          zoomControl={false}
          attributionControl={false}
          scrollWheelZoom={false}
          dragging={!L.Browser.mobile}
          keyboard={false}
          className="absolute! inset-0 z-0 h-full w-full"
        >
          <TileLayer url={IMAGERY} maxNativeZoom={18} maxZoom={18} />
          <Fit ring={ring} center={center} radius={radius} />
          {ring ? (
            <>
              <Polygon positions={ring} interactive={false} pathOptions={{ color: CASING, weight: st.weight + 4, fill: false }} />
              <Polygon positions={ring} interactive={false} pathOptions={path} />
            </>
          ) : areaHa && areaHa > 0 ? (
            <>
              <Circle center={center} radius={radius} interactive={false} pathOptions={{ color: CASING, weight: st.weight + 4, fill: false }} />
              <Circle center={center} radius={radius} interactive={false} pathOptions={path} />
            </>
          ) : (
            <>
              <CircleMarker center={center} radius={14} interactive={false} pathOptions={{ stroke: false, fillColor: CASING, fillOpacity: 0.85 }} />
              <CircleMarker center={center} radius={11} interactive={false} pathOptions={{ ...path, fillOpacity: 0.9 }} />
            </>
          )}
          <Marker position={center} icon={labelIcon(risk.level)} interactive={false} keyboard={false} />
        </MapContainer>
      </div>
      <ErosionLegend risk={risk} />
      <p className={cx('m-0', type.label, fg.fg2)}>
        {risk.level === 'low'
          ? 'Keep crop residue on the field after harvest to keep it that way.'
          : 'Keep a cover crop or crop residue on the soil in those months, and plough and sow across the slope, not up and down it.'}
      </p>
      <p className={cx('m-0 text-[12px]', fg.fg3)}>
        {shapeNote} Screening estimate from the rotation calendar,{' '}
        {risk.basis.heavyRainFrom === 'farm_year'
          ? 'past heavy-rain days (NASA POWER)'
          : risk.basis.heavyRainFrom === 'monthly_rain'
            ? `months averaging ${HEAVY_RAIN_MONTHLY_MM} mm of rain or more (NASA POWER)`
            : 'no heavy-rain data'}{' '}
        and slope from the 30 m Copernicus elevation model. It does not see bunds, terraces or ditches on your land.
      </p>
    </Card>
  )
}
