import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip as LTooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import type { LatLngExpression } from 'leaflet'
import { create } from 'zustand'
import { ArrowRight, Info, LocateFixed, Maximize, Minus, Plus } from 'lucide-react'
import type { FieldInfo, Quality } from '../types/api'
import { useProfile } from '../api/hooks'
import DataQualityBadge from './DataQualityBadge'
import MapSearch, { type SearchPick } from './MapSearch'
import { useNavigate } from 'react-router-dom'
import SearchPinCard, { type SearchPin } from './SearchPinCard'
import { reversePlace, zoomForKind } from '../lib/geo/geocode'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { Notice } from './ui/Notice'
import { SegmentedControl } from './ui/SegmentedControl'
import { Skeleton } from './ui/Skeleton'
import { buttonClasses } from './ui/buttonStyles'
import { cn } from './ui/cn'

/* ------------------------------------------------------------ basemaps */
type MapStyle = 'standard' | 'satellite'

// Map style survives navigating away and back (in memory only, never persisted).
const useMapStyle = create<{ mapStyle: MapStyle; setMapStyle: (s: MapStyle) => void }>((set) => ({
  mapStyle: 'standard',
  setMapStyle: (mapStyle) => set({ mapStyle }),
}))

const BASEMAPS: Record<MapStyle, { url: string; attribution: string; subdomains?: string; maxNativeZoom?: number }> = {
  // Esri World Dark Gray Canvas (keyless). CARTO Dark Matter, the spec's first choice, now
  // returns an "API KEY REQUIRED" placeholder tile without a key, so it cannot be used keyless.
  standard: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 16,
    attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS User Community',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 17,
    attribution: 'Tiles © Esri — Maxar, Earthstar Geographics, GIS User Community',
  },
}

/* --------------------------------------------------------- map styling */
const CASING = 'rgba(4,18,10,0.85)'
const POLY = {
  default: { color: '#E7F5EC', weight: 2, fillColor: '#4ADE80', fillOpacity: 0.2 },
  hover: { color: '#FFFFFF', weight: 2, fillColor: '#4ADE80', fillOpacity: 0.32 },
  selected: { color: '#BEF264', weight: 3, fillColor: '#BEF264', fillOpacity: 0.35 },
}
const MARKER_HIDE_ZOOM = 14 // polygons are clearly visible from here on

const DEFAULT_CENTER: LatLngExpression = [30.2, 71.5]

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// GeoJSON Polygon is [lon, lat]; Leaflet wants [lat, lon]. Outer ring only.
function toLatLngs(f: FieldInfo): LatLngExpression[] {
  const ring = (f.geometry as { coordinates?: number[][][] }).coordinates?.[0] ?? []
  return ring.map(([lon, lat]) => [lat, lon] as LatLngExpression)
}

function boundsOf(fields: FieldInfo[]): L.LatLngBounds | null {
  const pts = fields.flatMap(toLatLngs)
  return pts.length ? L.latLngBounds(pts as L.LatLngTuple[]) : null
}

function fitFields(map: L.Map, fields: FieldInfo[], maxZoom: number, duration = 0.6) {
  const bounds = boundsOf(fields)
  if (!bounds) return
  if (prefersReducedMotion()) map.fitBounds(bounds, { padding: [40, 40], maxZoom, animate: false })
  else map.flyToBounds(bounds, { padding: [40, 40], maxZoom, duration })
}

// Runs only on field / selection changes (never on device-location events).
function FitBounds({ fields, selectedId }: { fields: FieldInfo[]; selectedId: string | null }) {
  const map = useMap()
  useEffect(() => {
    const target = fields.filter((f) => !selectedId || f.field_id === selectedId)
    fitFields(map, target, selectedId ? 15 : 8)
  }, [map, fields, selectedId])
  return null
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  return null
}

function ClickToPin({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

/* ------------------------------------------------------ device location */
type LocNoticeKind = 'success' | 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'insecure'

const LOC_COPY: Record<LocNoticeKind, string> = {
  success:
    'Your location is shown on the map. The demo fields may be far from you, so pick one from the list.',
  denied:
    'Location permission was denied. Allow location access in your browser settings to use this, or pick a field from the list.',
  unavailable: 'Your device could not work out a location. Try again, or pick a field from the list.',
  timeout: 'Finding your location took too long. Try again, or pick a field from the list.',
  unsupported: 'This browser does not support device location. Pick a field from the list instead.',
  insecure: 'Device location needs a secure (https) connection. Pick a field from the list instead.',
}

interface UserPosition {
  lat: number
  lon: number
  accuracy: number
}

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }

/* ------------------------------------------------------- field info card */
function FieldInfoCard({ field }: { field: FieldInfo }) {
  const { data, isLoading, isError } = useProfile(field.field_id)
  const quality: Quality = data ? data.data_mode : 'unavailable'
  return (
    <div
      data-component="FieldInfoCard"
      className="glass-strong flex min-w-0 flex-col gap-2 rounded-[var(--radius-control)] p-4 sm:max-w-[360px] lg:hidden"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="m-0 min-w-0 truncate text-body font-semibold text-fg" title={`${field.field_id} · ${field.name}`}>
          {field.field_id} · {field.name}
        </p>
        <DataQualityBadge quality={isError ? 'unavailable' : quality} loading={isLoading} />
      </div>
      <Link to={`/fields/${field.field_id}`} className={cn(buttonClasses('primary'), 'w-full')}>
        Compare rotations
        <ArrowRight size={20} strokeWidth={1.75} aria-hidden />
      </Link>
    </div>
  )
}

/* ----------------------------------------------------------- component */
interface Props {
  fields: FieldInfo[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Optional: shows a Skeleton overlay while the field list loads. */
  isLoading?: boolean
  /** Card shown for the selected field (defaults to the demo FieldInfoCard). */
  selectedCard?: (f: FieldInfo) => ReactNode
  /** Footnote under the map; null hides it. */
  note?: string | null
}

export default function FieldMap({
  fields,
  selectedId,
  onSelect,
  isLoading = false,
  selectedCard,
  note = 'Field boundaries are hand-drawn demo polygons, not surveyed parcels.',
}: Props) {
  const navigate = useNavigate()
  const mapStyle = useMapStyle((s) => s.mapStyle)
  const setMapStyle = useMapStyle((s) => s.setMapStyle)
  const [map, setMap] = useState<L.Map | null>(null)
  const [zoom, setZoom] = useState(5)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // satellite tile failure: show once per style switch
  const [satNotice, setSatNotice] = useState<'hidden' | 'shown' | 'dismissed'>('hidden')
  const changeStyle = (s: MapStyle) => {
    setMapStyle(s)
    setSatNotice('hidden')
  }
  const onTileError = useCallback(() => {
    setSatNotice((s) => (s === 'hidden' ? 'shown' : s))
  }, [])

  // device location: component state only. Never stored, persisted or sent anywhere.
  const [position, setPosition] = useState<UserPosition | null>(null)
  const [locating, setLocating] = useState(false)
  const [locNotice, setLocNotice] = useState<LocNoticeKind | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const flyToPosition = useCallback(
    (p: UserPosition) => {
      if (!map) return
      const bounds = L.latLng(p.lat, p.lon).toBounds(Math.max(p.accuracy, 50) * 2)
      if (prefersReducedMotion()) map.fitBounds(bounds, { maxZoom: 13, animate: false })
      else map.flyToBounds(bounds, { maxZoom: 13, duration: 0.8 })
    },
    [map],
  )

  const locate = () => {
    if (position) {
      // already located: re-centre on the known position
      flyToPosition(position)
      setLocNotice('success')
      return
    }
    setLocNotice(null)
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setLocNotice('unsupported')
      return
    }
    if (!window.isSecureContext) {
      setLocNotice('insecure')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mounted.current) return
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }
        setPosition(p)
        setLocating(false)
        setLocNotice('success')
        flyToPosition(p)
        placeCoordsPin(p.lat, p.lon, false, false)
      },
      (err) => {
        if (!mounted.current) return
        setLocating(false)
        setLocNotice(
          err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable',
        )
      },
      GEO_OPTIONS,
    )
  }

  const clearLocation = () => {
    setPosition(null)
    setLocNotice(null)
  }

  const showAll = () => {
    if (map) fitFields(map, fields, 8)
  }

  /* ----- search: places, coordinates, regions, fields ----- */
  const [pin, setPin] = useState<SearchPin | null>(null)
  const reverseCtrl = useRef<AbortController | null>(null)
  useEffect(() => () => reverseCtrl.current?.abort(), [])

  const flyTo = useCallback(
    (lat: number, lon: number, zoomLevel: number, bbox?: [number, number, number, number]) => {
      if (!map) return
      const animate = !prefersReducedMotion()
      if (bbox && (bbox[0] !== bbox[2] || bbox[1] !== bbox[3])) {
        const b = L.latLngBounds([bbox[1], bbox[0]], [bbox[3], bbox[2]])
        if (animate) map.flyToBounds(b, { padding: [40, 40], maxZoom: 16, duration: 0.8 })
        else map.fitBounds(b, { padding: [40, 40], maxZoom: 16, animate: false })
      } else if (animate) map.flyTo([lat, lon], zoomLevel, { duration: 0.8 })
      else map.setView([lat, lon], zoomLevel, { animate: false })
    },
    [map],
  )

  // Drop a coordinate pin (typed, clicked on the map, or from device GPS) and look up its address.
  const placeCoordsPin = (lat: number, lon: number, swapped: boolean, fly: boolean) => {
    reverseCtrl.current?.abort()
    setPin({ lat, lon, place: null, source: 'coords', status: 'loading', swapped })
    if (fly) flyTo(lat, lon, 14)
    const ctrl = new AbortController()
    reverseCtrl.current = ctrl
    reversePlace(lat, lon, ctrl.signal)
      .then((place) => {
        if (!ctrl.signal.aborted) setPin((p) => (p && p.lat === lat && p.lon === lon ? { ...p, place, status: 'ready' } : p))
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return
        setPin((p) => (p && p.lat === lat && p.lon === lon ? { ...p, status: 'error' } : p))
      })
  }

  const onSearchPick = (pick: SearchPick) => {
    reverseCtrl.current?.abort()
    switch (pick.kind) {
      case 'field':
        setPin(null)
        onSelect(pick.field.field_id)
        if (map) fitFields(map, [pick.field], 15)
        break
      case 'region':
        setPin(null)
        if (map) fitFields(map, pick.region.fields, 13)
        break
      case 'place': {
        const { place } = pick
        setPin({ lat: place.lat, lon: place.lon, place, source: 'place', status: 'ready' })
        flyTo(place.lat, place.lon, zoomForKind(place.kind), place.bbox)
        break
      }
      case 'coords': {
        placeCoordsPin(pick.lat, pick.lon, pick.swapped, true)
        break
      }
    }
  }

  const clearPin = () => {
    reverseCtrl.current?.abort()
    setPin(null)
  }

  const goToField = (id: string) => {
    onSelect(id)
    const f = fields.find((x) => x.field_id === id)
    if (map && f) fitFields(map, [f], 15)
  }

  const basemap = BASEMAPS[mapStyle]
  const selectedField = fields.find((f) => f.field_id === selectedId) ?? null
  const showMarkers = zoom < MARKER_HIDE_ZOOM
  const locateLabel = locating ? 'Locating…' : 'Use my device location'
  const locateIconCls = position ? 'text-accent fill-accent/30' : undefined

  return (
    <div
      data-component="FieldMap"
      data-map-style={mapStyle}
      className="relative isolate h-full min-h-[320px] w-full overflow-hidden bg-map-bg"
    >
      <MapContainer
        ref={setMap}
        center={DEFAULT_CENTER}
        zoom={5}
        maxZoom={17}
        zoomControl={false}
        attributionControl={false}
        className="absolute! inset-0 z-0 h-full w-full"
      >
        <TileLayer
          key={mapStyle}
          url={basemap.url}
          subdomains={basemap.subdomains ?? 'abc'}
          maxNativeZoom={basemap.maxNativeZoom}
          maxZoom={17}
          eventHandlers={mapStyle === 'satellite' ? { tileerror: onTileError } : undefined}
        />
        <FitBounds fields={fields} selectedId={selectedId} />
        <ZoomWatcher onZoom={setZoom} />
        <ClickToPin onPick={(lat, lon) => placeCoordsPin(lat, lon, false, false)} />

        {fields.map((f) => {
          const selected = f.field_id === selectedId
          const hovered = !selected && hoveredId === f.field_id
          const latlngs = toLatLngs(f)
          const style = selected ? POLY.selected : hovered ? POLY.hover : POLY.default
          const select = () => onSelect(f.field_id)
          return (
            <Fragment key={`${f.field_id}-${selected}`}>
              {/* dark casing keeps the outline readable on dark tiles and bright imagery */}
              <Polygon
                positions={latlngs}
                interactive={false}
                pathOptions={{ color: CASING, weight: selected ? 7 : 5, fill: false }}
              />
              <Polygon
                positions={latlngs}
                pathOptions={style}
                eventHandlers={{
                  click: select,
                  mouseover: () => setHoveredId(f.field_id),
                  mouseout: () => setHoveredId((h) => (h === f.field_id ? null : h)),
                }}
              >
                <LTooltip sticky>
                  {f.field_id} · {f.name}
                </LTooltip>
              </Polygon>
              {/* Marker keeps fields visible at low zoom, where the polygon is sub-pixel. */}
              {(showMarkers || selected) && (
                <>
                  <CircleMarker
                    center={[f.location.lat, f.location.lon]}
                    radius={(selected ? 11 : 7) + 3}
                    interactive={false}
                    pathOptions={{ stroke: false, fillColor: CASING, fillOpacity: 0.85 }}
                  />
                  <CircleMarker
                    center={[f.location.lat, f.location.lon]}
                    radius={selected ? 11 : 7}
                    pathOptions={
                      selected
                        ? { color: '#04120A', weight: 2, fillColor: '#BEF264', fillOpacity: 1 }
                        : { color: '#E7F5EC', weight: 2, fillColor: '#4ADE80', fillOpacity: 1 }
                    }
                    eventHandlers={{ click: select }}
                  >
                    <LTooltip>
                      {f.field_id} · {f.name}
                    </LTooltip>
                  </CircleMarker>
                </>
              )}
            </Fragment>
          )
        })}

        {position && (
          <>
            <Circle
              center={[position.lat, position.lon]}
              radius={position.accuracy}
              interactive={false}
              pathOptions={{ color: '#38BDF8', weight: 1, fillColor: '#38BDF8', fillOpacity: 0.12 }}
            />
            <CircleMarker
              center={[position.lat, position.lon]}
              radius={8}
              interactive={false}
              pathOptions={{ stroke: false, fillColor: '#38BDF8', fillOpacity: 0.5, className: 'fsa-user-pulse' }}
            />
            <CircleMarker
              center={[position.lat, position.lon]}
              radius={8}
              pathOptions={{ color: '#FFFFFF', weight: 3, fillColor: '#38BDF8', fillOpacity: 1 }}
            >
              <LTooltip>Your location</LTooltip>
            </CircleMarker>
          </>
        )}

        {pin && (
          <>
            <CircleMarker
              center={[pin.lat, pin.lon]}
              radius={12}
              interactive={false}
              pathOptions={{ stroke: false, fillColor: CASING, fillOpacity: 0.85 }}
            />
            <CircleMarker
              center={[pin.lat, pin.lon]}
              radius={9}
              pathOptions={{ color: '#FFFFFF', weight: 3, fillColor: '#F0ABFC', fillOpacity: 1 }}
            >
              <LTooltip>{pin.place?.name ?? 'Search result'}</LTooltip>
            </CircleMarker>
          </>
        )}
      </MapContainer>

      {isLoading && (
        <div className="absolute inset-0 z-[900] p-4" aria-hidden>
          <Skeleton className="h-full w-full rounded-[var(--radius-control)] opacity-60" />
        </div>
      )}

      {/* ----- top-left toolbar ----- */}
      {/* right edge leaves room for the 44px zoom stack */}
      <div className="pointer-events-none absolute left-4 right-[68px] top-4 z-[1000] flex flex-col items-start gap-2">
        <MapSearch fields={fields} onPick={onSearchPick} className="pointer-events-auto max-w-[440px]" />
        <div className="glass-strong pointer-events-auto flex items-center gap-2 rounded-full p-2">
          <SegmentedControl
            label="Map style"
            value={mapStyle}
            onChange={changeStyle}
            options={[
              { value: 'standard', label: 'Map' },
              { value: 'satellite', label: 'Satellite' },
            ]}
            className="border-transparent! bg-transparent! shadow-none! backdrop-blur-none!"
          />
          <span className="hidden sm:inline-flex">
            <Button
              variant="secondary"
              icon={LocateFixed}
              loading={locating}
              onClick={locate}
              className={cn('rounded-full', position && '[&>svg]:text-accent')}
            >
              {locateLabel}
            </Button>
          </span>
          <span className="inline-flex sm:hidden">
            <IconButton
              label={locateLabel}
              icon={LocateFixed}
              loading={locating}
              onClick={locate}
              tooltipSide="bottom"
              className="rounded-full"
              iconClassName={locateIconCls}
            />
          </span>
        </div>

        {/* ----- notices (under the toolbar) ----- */}
        {(locNotice || satNotice === 'shown') && (
          <div className="pointer-events-auto flex w-full max-w-[480px] flex-col gap-2">
            {satNotice === 'shown' && mapStyle === 'satellite' && (
              <Notice tone="warn" compact onDismiss={() => setSatNotice('dismissed')} className="glass-strong">
                Satellite imagery could not load. Check your connection or switch back to Map. Field boundaries are
                still shown.
              </Notice>
            )}
            {locNotice && (
              <Notice
                tone={locNotice === 'success' ? 'success' : 'error'}
                compact
                onDismiss={() => setLocNotice(null)}
                className="glass-strong"
                actions={
                  locNotice === 'success' ? (
                    <>
                      <Button variant="ghost" onClick={showAll}>
                        Show all fields
                      </Button>
                      <Button variant="ghost" onClick={clearLocation}>
                        Clear location
                      </Button>
                    </>
                  ) : undefined
                }
              >
                {LOC_COPY[locNotice]}
              </Notice>
            )}
          </div>
        )}
      </div>

      {/* ----- top-right zoom stack (zoom buttons hidden below 640px: pinch-zoom there) ----- */}
      <div className="absolute right-4 top-4 z-[1000] flex flex-col gap-2">
        <span className="hidden sm:inline-flex">
          <IconButton label="Zoom in" icon={Plus} onClick={() => map?.zoomIn()} className="glass-strong" />
        </span>
        <span className="hidden sm:inline-flex">
          <IconButton label="Zoom out" icon={Minus} onClick={() => map?.zoomOut()} className="glass-strong" />
        </span>
        <IconButton label="Show all fields" icon={Maximize} onClick={showAll} className="glass-strong" />
      </div>

      {/* ----- bottom overlays ----- */}
      <div className="pointer-events-none absolute inset-x-4 bottom-4 z-[1000] flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="pointer-events-auto flex min-w-0 flex-col gap-2">
          {pin && <SearchPinCard pin={pin} fields={fields} onSelectField={goToField} onClose={clearPin} onAnalyze={() => navigate(`/location?lat=${pin.lat.toFixed(5)}&lon=${pin.lon.toFixed(5)}`)} />}
          {selectedField && !pin && (selectedCard ? selectedCard(selectedField) : <FieldInfoCard field={selectedField} />)}
          {note && <p className="glass-strong m-0 max-w-[360px] items-start gap-2 data-[pinned=true]:max-sm:hidden flex rounded-[var(--radius-control)] p-2 text-label font-semibold text-fg"
            data-pinned={pin ? 'true' : undefined}
          >
            <span className="flex h-[20px] shrink-0 items-center pl-1">
              <Info size={16} strokeWidth={1.75} aria-hidden className="text-derived" />
            </span>
            <span className="pr-1">{note}</span>
          </p>}
        </div>
        <p
          data-component="MapAttribution"
          className="glass-strong pointer-events-auto m-0 line-clamp-2 max-w-[min(100%,560px)] self-start rounded-[var(--radius-chip)] px-2 py-1 text-label font-normal text-fg-2 sm:self-end"
        >
          {basemap.attribution}
        </p>
      </div>
    </div>
  )
}
