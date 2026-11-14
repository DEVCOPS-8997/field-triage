import { useEffect, useMemo, useState } from 'react'
import { Circle, MapContainer, Marker, Polygon, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { ShapeIn, ShapeType } from '../../api/account'
import { destination, fmtLen, haversineM, sidesM, type LonLat } from '../../lib/geo/measure'

export type DrawMode = ShapeType | null

const TILES = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 18,
  },
  map: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri, HERE, Garmin, © OpenStreetMap contributors',
    maxNativeZoom: 18,
  },
} as const

const LINE = { color: '#BEF264', weight: 3 }
const FILL = { ...LINE, fillColor: '#BEF264', fillOpacity: 0.22 }

const vertexIcon = (first = false) =>
  L.divIcon({
    className: 'fsa-vertex',
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${first ? '#BEF264' : '#ffffff'};border:3px solid #04120a;box-shadow:0 0 0 2px #BEF264"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })

const lengthIcon = (text: string) =>
  L.divIcon({
    className: 'fsa-len',
    html: `<span style="display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;padding:2px 6px;border-radius:6px;background:rgba(4,18,10,0.85);color:#ecfdf3;font:600 11px/1.3 system-ui,sans-serif;border:1px solid rgba(190,242,220,0.35)">${text}</span>`,
    iconSize: [0, 0],
  })

const ll = (p: LonLat): [number, number] => [p[1], p[0]]
const lonlat = (e: L.LatLng): LonLat => [e.lng, e.lat]

function FlyTo({ target }: { target: { lat: number; lon: number; zoom?: number; key: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lon], target.zoom ?? 17, { duration: 0.8 })
  }, [map, target])
  return null
}

function FitShape({ shape, once }: { shape: ShapeIn | null; once: boolean }) {
  const map = useMap()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!once || done || !shape) return
    if (shape.type === 'circle' && shape.center && shape.radius_m) {
      map.fitBounds(L.latLng(shape.center[1], shape.center[0]).toBounds(shape.radius_m * 2.4))
    } else if (shape.coordinates?.length) {
      map.fitBounds(L.latLngBounds(shape.coordinates.map(ll)), { padding: [40, 40] })
    }
    setDone(true)
  }, [map, shape, once, done])
  return null
}

/** Segment-length labels at the midpoint of every edge. */
function SideLabels({ ring, closed }: { ring: LonLat[]; closed: boolean }) {
  const sides = sidesM(ring)
  const n = closed ? ring.length : ring.length - 1
  return (
    <>
      {Array.from({ length: Math.max(0, n) }, (_, i) => {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        return (
          <Marker
            key={`len-${i}`}
            position={[(a[1] + b[1]) / 2, (a[0] + b[0]) / 2]}
            icon={lengthIcon(fmtLen(sides[i]))}
            interactive={false}
            keyboard={false}
          />
        )
      })}
    </>
  )
}

/**
 * Map for marking a field. Modes:
 *  - polygon: click to add corners, click the first corner (or press Finish) to close; drag corners to adjust
 *  - rectangle: click one corner, then the opposite corner
 *  - circle: click the centre, then a point on the edge; drag the centre or the edge handle to adjust
 */
export default function DrawMap({
  mode,
  shape,
  draft,
  onDraft,
  onShape,
  flyTarget,
  fitOnLoad = false,
  tiles = 'satellite',
}: {
  mode: DrawMode
  shape: ShapeIn | null
  draft: LonLat[]
  onDraft: (pts: LonLat[]) => void
  onShape: (s: ShapeIn | null) => void
  flyTarget: { lat: number; lon: number; zoom?: number; key: number } | null
  fitOnLoad?: boolean
  tiles?: keyof typeof TILES
}) {
  const [hover, setHover] = useState<LonLat | null>(null)
  const t = TILES[tiles]

  function Events() {
    const map = useMapEvents({
      click(e) {
        if (!mode) return
        const p = lonlat(e.latlng)
        if (mode === 'polygon') {
          if (draft.length >= 3) {
            const first = map.latLngToContainerPoint(ll(draft[0]) as L.LatLngTuple)
            if (first.distanceTo(e.containerPoint) < 14) {
              onShape({ type: 'polygon', coordinates: draft })
              onDraft([])
              return
            }
          }
          onDraft([...draft, p])
        } else if (mode === 'rectangle') {
          if (draft.length === 0) onDraft([p])
          else {
            const [a] = draft
            onShape({ type: 'rectangle', coordinates: [a, [p[0], a[1]], p, [a[0], p[1]]] })
            onDraft([])
          }
        } else if (mode === 'circle') {
          if (draft.length === 0) onDraft([p])
          else {
            onShape({ type: 'circle', center: draft[0], radius_m: Math.max(1, haversineM(draft[0], p)) })
            onDraft([])
          }
        }
      },
      mousemove(e) {
        if (mode && draft.length) setHover(lonlat(e.latlng))
      },
    })
    useEffect(() => {
      if (mode) map.doubleClickZoom.disable()
      else map.doubleClickZoom.enable()
    }, [map])
    return null
  }

  // Preview while drawing
  const preview = useMemo(() => {
    if (!mode || draft.length === 0) return null
    if (mode === 'polygon') return hover ? [...draft, hover] : draft
    if (mode === 'rectangle' && hover) {
      const a = draft[0]
      return [a, [hover[0], a[1]], hover, [a[0], hover[1]]] as LonLat[]
    }
    return null
  }, [mode, draft, hover])

  const ring: LonLat[] | null = shape && shape.type !== 'circle' && shape.coordinates ? shape.coordinates : null
  const editing = !mode // after drawing, handles are draggable

  const moveVertex = (i: number, p: LonLat) => {
    if (!ring) return
    const next = ring.map((q, j) => (j === i ? p : q)) as LonLat[]
    // Dragging one corner of a rectangle keeps it a rectangle (opposite corner fixed).
    if (shape?.type === 'rectangle' && ring.length === 4) {
      const o = ring[(i + 2) % 4]
      const pts: LonLat[] = [o, [p[0], o[1]], p, [o[0], p[1]]]
      const rotated = [...pts.slice((4 - ((i + 2) % 4)) % 4), ...pts.slice(0, (4 - ((i + 2) % 4)) % 4)] as LonLat[]
      onShape({ type: 'rectangle', coordinates: rotated })
      return
    }
    onShape({ type: 'polygon', coordinates: next })
  }

  return (
    <MapContainer center={[30.2, 71.5]} zoom={5} maxZoom={19} className="h-full w-full" attributionControl={false}>
      <TileLayer url={t.url} maxNativeZoom={t.maxNativeZoom} maxZoom={19} />
      <Events />
      <FlyTo target={flyTarget} />
      <FitShape shape={shape} once={fitOnLoad} />

      {/* finished shape */}
      {ring && (
        <>
          <Polygon positions={ring.map(ll)} pathOptions={FILL} />
          <SideLabels ring={ring} closed />
          {editing &&
            ring.map((p, i) => (
              <Marker
                key={`v-${i}-${p[0]}-${p[1]}`}
                position={ll(p)}
                icon={vertexIcon()}
                draggable
                title={`Corner ${i + 1}: drag to adjust`}
                eventHandlers={{ dragend: (e) => moveVertex(i, lonlat((e.target as L.Marker).getLatLng())) }}
              />
            ))}
        </>
      )}
      {shape?.type === 'circle' && shape.center && shape.radius_m && (
        <>
          <Circle center={ll(shape.center)} radius={shape.radius_m} pathOptions={FILL} />
          <Marker position={ll(destination(shape.center, shape.radius_m / 2, 90))} icon={lengthIcon(`r ${fmtLen(shape.radius_m)}`)} interactive={false} />
          {editing && (
            <>
              <Marker
                key={`c-${shape.center.join()}`}
                position={ll(shape.center)}
                icon={vertexIcon(true)}
                draggable
                title="Centre: drag to move the circle"
                eventHandlers={{ dragend: (e) => onShape({ ...shape, center: lonlat((e.target as L.Marker).getLatLng()) }) }}
              />
              <Marker
                key={`r-${shape.center.join()}-${shape.radius_m}`}
                position={ll(destination(shape.center, shape.radius_m, 90))}
                icon={vertexIcon()}
                draggable
                title="Edge: drag to change the size"
                eventHandlers={{
                  dragend: (e) => onShape({ ...shape, radius_m: Math.max(1, haversineM(shape.center!, lonlat((e.target as L.Marker).getLatLng()))) }),
                }}
              />
            </>
          )}
        </>
      )}

      {/* drawing preview */}
      {mode === 'polygon' && draft.length > 0 && (
        <>
          <Polyline positions={(preview ?? draft).map(ll)} pathOptions={{ ...LINE, dashArray: '6 6' }} />
          <SideLabels ring={preview ?? draft} closed={false} />
          {draft.map((p, i) => (
            <Marker key={`d-${i}`} position={ll(p)} icon={vertexIcon(i === 0)} interactive={false} />
          ))}
        </>
      )}
      {mode === 'rectangle' && preview && (
        <>
          <Polygon positions={preview.map(ll)} pathOptions={{ ...FILL, dashArray: '6 6' }} />
          <SideLabels ring={preview} closed />
        </>
      )}
      {mode === 'circle' && draft.length === 1 && (
        <>
          <Marker position={ll(draft[0])} icon={vertexIcon(true)} interactive={false} />
          {hover && <Circle center={ll(draft[0])} radius={haversineM(draft[0], hover)} pathOptions={{ ...FILL, dashArray: '6 6' }} />}
          {hover && <Marker position={ll(hover)} icon={lengthIcon(`r ${fmtLen(haversineM(draft[0], hover))}`)} interactive={false} />}
        </>
      )}
    </MapContainer>
  )
}

export { TILES }
