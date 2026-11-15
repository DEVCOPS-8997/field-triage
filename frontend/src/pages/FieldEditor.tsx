import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Circle as CircleIcon,
  Eraser,
  Hexagon,
  LocateFixed,
  Save,
  Search,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react'
import {
  EQUIPMENT_IDS,
  accountApi,
  equipParam,
  useDeleteField,
  useMyField,
  useSaveField,
  type GeocodeHit,
  type ShapeIn,
} from '../api/account'
import type { EquipmentId } from '../types/api'
import { api } from '../api/client'
import DrawMap, { type DrawMode } from '../components/fields/DrawMap'
import PageHeader from '../components/shell/PageHeader'
import { Button } from '../components/ui/Button'
import { Notice } from '../components/ui/Notice'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { buttonClasses } from '../components/ui/buttonStyles'
import { fmtArea, fmtLen, ringAreaM2, selfIntersects, sidesM, type LonLat } from '../lib/geo/measure'
import { accountsEnabled } from '../lib/supabase'
import { useAuth } from '../store/useAuth'
import { AccountsNotConfigured, inputCls } from './Account'

type Irrigation = 'none' | 'limited' | 'reliable'

const HELP: Record<Exclude<DrawMode, null>, string> = {
  polygon: 'Click each corner of the field on the map. Click the first corner again (or press Finish) to close the shape.',
  rectangle: 'Click one corner of the field, then click the opposite corner.',
  circle: 'Click the centre of the field, then click a point on its edge.',
}

/** Plain labels for "Equipment or help I do NOT have" (ids match the backend FarmConstraints). */
const EQUIPMENT_COPY: Record<EquipmentId, { label: string; hint: string }> = {
  seed_drill: { label: 'Seed drill', hint: 'Sows wheat, chickpea or lentil in lines, also for zero-till sowing.' },
  combine_harvester: { label: 'Combine harvester (own or for hire)', hint: 'Cuts large wheat or rice areas quickly at harvest time.' },
  rice_transplanting: { label: 'Workers or machine to transplant rice', hint: 'Rice seedlings must be planted out by hand or machine within a few days.' },
  picking_labour: { label: 'Workers to pick cotton by hand', hint: 'Cotton is picked by hand several times over many weeks.' },
  orchard_commitment: { label: 'Land I can keep under fruit trees for 10+ years', hint: 'Orchards take years before they pay and tie up the field.' },
  daily_market_access: { label: 'A market I can reach every day', hint: 'Vegetables must be sold within a day or two of picking.' },
}

function measureShape(s: ShapeIn | null) {
  if (!s) return null
  if (s.type === 'circle' && s.center && s.radius_m) {
    return { area: Math.PI * s.radius_m ** 2, perimeter: 2 * Math.PI * s.radius_m, sides: [] as number[], center: s.center, crosses: false }
  }
  const ring = s.coordinates ?? []
  const sides = sidesM(ring)
  const center: LonLat = [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length]
  return { area: ringAreaM2(ring), perimeter: sides.reduce((a, b) => a + b, 0), sides, center, crosses: selfIntersects(ring) }
}

function Select({ label, value, onChange, options, hint }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-label font-semibold text-fg-2">
      {label}
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {hint && <span className="font-normal text-fg-3">{hint}</span>}
    </label>
  )
}

export default function FieldEditor() {
  const { id } = useParams()
  const fieldId = id && id !== 'new' ? Number(id) : null
  const user = useAuth((s) => s.user)
  const ready = useAuth((s) => s.ready)
  const navigate = useNavigate()
  const existing = useMyField(fieldId)
  const save = useSaveField()
  const del = useDeleteField()

  const [mode, setMode] = useState<DrawMode>('polygon')
  const [draft, setDraft] = useState<LonLat[]>([])
  const [shape, setShape] = useState<ShapeIn | null>(null)
  const [tiles, setTiles] = useState<'satellite' | 'map'>('satellite')
  const [fly, setFly] = useState<{ lat: number; lon: number; zoom?: number; key: number } | null>(null)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<GeocodeHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [irrigation, setIrrigation] = useState<Irrigation>('none')
  const [rotation, setRotation] = useState('')
  const [waterSource, setWaterSource] = useState('')
  const [soilType, setSoilType] = useState('')
  const [goal, setGoal] = useState('')
  const [equipment, setEquipment] = useState('')
  const [market, setMarket] = useState('')
  const [notes, setNotes] = useState('')
  const [unavail, setUnavail] = useState<EquipmentId[]>([])
  const [error, setError] = useState<string | null>(null)

  // Load an existing field into the editor once.
  const [loadedId, setLoadedId] = useState<number | null>(null)
  useEffect(() => {
    const f = existing.data
    if (!f || loadedId === f.id) return
    setLoadedId(f.id)
    setShape(f.shape)
    setMode(null)
    setName(f.name)
    setAddress(f.address ?? '')
    setIrrigation(f.irrigation)
    setRotation(f.current_rotation_id ?? '')
    setWaterSource(f.details.water_source ?? '')
    setSoilType(f.details.soil_type ?? '')
    setGoal(f.details.main_goal ?? '')
    setEquipment(f.details.equipment ?? '')
    setMarket(f.details.market ?? '')
    setNotes(f.details.notes ?? '')
    setUnavail(f.unavailable_equipment ?? [])
  }, [existing.data, loadedId])

  const m = useMemo(() => measureShape(shape), [shape])
  const live = useMemo(() => {
    // While drawing a polygon, show the running area of the corners placed so far.
    if (mode === 'polygon' && draft.length >= 3) return { area: ringAreaM2(draft), perimeter: sidesM(draft).reduce((a, b) => a + b, 0) }
    return null
  }, [mode, draft])

  // Rotations offered for this spot (region lookup by the field's centre).
  const center = m?.center ?? null
  const region = useQuery({
    queryKey: ['location-region', center?.[1]?.toFixed(3), center?.[0]?.toFixed(3)],
    queryFn: () => api.locationRegion(center![1], center![0]),
    enabled: !!center,
    retry: false,
    staleTime: 10 * 60_000,
  })

  const pickMode = (next: Exclude<DrawMode, null>) => {
    setDraft([])
    setShape(null)
    setMode(next)
  }

  const search = async (e?: FormEvent) => {
    e?.preventDefault()
    if (query.trim().length < 3) return
    setSearching(true)
    setSearchErr(null)
    try {
      const r = await accountApi.geocode(query.trim())
      setHits(r)
      if (r.length === 0) setSearchErr('No match. Try a nearby village or town name.')
    } catch (err) {
      setSearchErr((err as Error).message)
    } finally {
      setSearching(false)
    }
  }

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setFly({ lat: p.coords.latitude, lon: p.coords.longitude, zoom: 17, key: Date.now() }),
      () => setSearchErr('Could not get your device location. Search an address instead.'),
      { timeout: 10_000 },
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!shape || !m) return setError('Mark the field on the map first.')
    if (m.crosses) return setError('The outline crosses itself. Clear it and draw the corners in order around the field.')
    try {
      const saved = await save.mutateAsync({
        id: fieldId,
        body: {
          name,
          address,
          shape,
          irrigation,
          current_rotation_id: rotation || null,
          details: { water_source: waterSource || null, soil_type: soilType || null, main_goal: goal || null, equipment: equipment || null, market: market || null, notes: notes || null },
          unavailable_equipment: unavail,
        },
      })
      navigate(`/my-fields/${saved.id}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (!accountsEnabled) return <AccountsNotConfigured />
  if (ready && !user) {
    return (
      <Notice tone="info" title="Sign in to add fields" actions={<Link to="/account?next=/my-fields/new" className={buttonClasses('primary')}>Sign in or create account</Link>}>
        Fields are saved to your own account.
      </Notice>
    )
  }

  const areaTxt = m ? fmtArea(m.area) : live ? fmtArea(live.area) : null
  const analyzeHref =
    existing.data &&
    `/location?lat=${existing.data.center.lat.toFixed(5)}&lon=${existing.data.center.lon.toFixed(5)}&field=${existing.data.id}` +
      `&name=${encodeURIComponent(existing.data.name)}&area_ha=${existing.data.area_ha.toFixed(4)}&irrigation=${existing.data.irrigation}` +
      (existing.data.current_rotation_id ? `&rotation=${existing.data.current_rotation_id}` : '') +
      equipParam(unavail)

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        backTo="/my-fields"
        backLabel="My fields"
        title={fieldId ? name || 'Edit field' : 'Add a field'}
        subtitle="Find your area, mark the field on the map, then tell us about it."
        trailing={analyzeHref ? (
          <Link to={analyzeHref} className={buttonClasses('primary')}>
            Analyze this field <ArrowRight size={20} strokeWidth={1.75} aria-hidden />
          </Link>
        ) : undefined}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* ------------------------------------------------------------ controls */}
        <form onSubmit={submit} className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
          <section className="glass flex flex-col gap-3 p-4">
            <h2 className="m-0 text-body font-semibold text-fg">1. Find your area</h2>
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Village, town or full address"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void search()
                  }
                }}
                aria-label="Search address"
              />
              <Button icon={Search} loading={searching} onClick={() => void search()} aria-label="Search">
                <span className="sr-only sm:not-sr-only">Find</span>
              </Button>
            </div>
            {hits.length > 0 && (
              <ul className="m-0 flex max-h-[180px] list-none flex-col gap-1 overflow-y-auto p-0">
                {hits.map((h) => (
                  <li key={`${h.lat},${h.lon}`}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-label text-fg-2 hover:bg-[rgba(255,255,255,0.08)] hover:text-fg"
                      onClick={() => {
                        setFly({ lat: h.lat, lon: h.lon, zoom: 17, key: Date.now() })
                        setAddress(h.label)
                        setHits([])
                      }}
                    >
                      {h.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {searchErr && <p className="m-0 text-label text-[color:var(--color-danger,#fda4af)]">{searchErr}</p>}
            <Button variant="ghost" icon={LocateFixed} onClick={useMyLocation} className="self-start">
              Use my device location
            </Button>
          </section>

          <section className="glass flex flex-col gap-3 p-4">
            <h2 className="m-0 text-body font-semibold text-fg">2. Mark the field</h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                ['polygon', 'Free shape', Hexagon],
                ['rectangle', 'Rectangle', Square],
                ['circle', 'Circle', CircleIcon],
              ] as const).map(([k, label, Icon]) => {
                const on = mode === k || (!mode && shape?.type === k)
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickMode(k)}
                    className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border text-label font-semibold transition-colors ${
                      on ? 'border-accent bg-accent/15 text-fg' : 'border-[color:var(--color-control-border,rgba(190,242,220,0.2))] text-fg-2 hover:bg-[rgba(255,255,255,0.06)]'
                    }`}
                  >
                    <Icon size={20} strokeWidth={1.75} aria-hidden className={on ? 'text-accent' : undefined} />
                    {label}
                  </button>
                )
              })}
            </div>
            <p className="m-0 text-label text-fg-3">
              {mode ? HELP[mode] : shape ? 'Drag the white handles on the map to adjust the shape.' : 'Pick a shape to start.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {mode === 'polygon' && draft.length > 0 && (
                <Button icon={Undo2} onClick={() => setDraft(draft.slice(0, -1))}>
                  Undo corner
                </Button>
              )}
              {mode === 'polygon' && draft.length >= 3 && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setShape({ type: 'polygon', coordinates: draft })
                    setDraft([])
                    setMode(null)
                  }}
                >
                  Finish shape
                </Button>
              )}
              {(shape || draft.length > 0) && (
                <Button
                  variant="ghost"
                  icon={Eraser}
                  onClick={() => {
                    setShape(null)
                    setDraft([])
                    setMode(shape?.type ?? mode ?? 'polygon')
                  }}
                >
                  Clear and redraw
                </Button>
              )}
            </div>

            {/* live measurements */}
            {areaTxt && (
              <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-control)] bg-[rgba(0,0,0,0.25)] p-3" aria-live="polite">
                <div className="flex flex-col">
                  <span className="text-[12px] text-fg-3">Area</span>
                  <span className="text-body font-semibold text-fg tabular-nums">{areaTxt.m2} m²</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[12px] text-fg-3">Hectares</span>
                  <span className="text-body font-semibold text-fg tabular-nums">{areaTxt.ha}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[12px] text-fg-3">Acres</span>
                  <span className="text-body font-semibold text-fg tabular-nums">{areaTxt.acres}</span>
                </div>
                <div className="col-span-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] pt-2 text-label text-fg-2">
                  <span>
                    Perimeter <strong className="text-fg tabular-nums">{fmtLen(m?.perimeter ?? live?.perimeter ?? 0)}</strong>
                  </span>
                  {shape?.type === 'circle' && shape.radius_m && (
                    <span>
                      Radius <strong className="text-fg tabular-nums">{fmtLen(shape.radius_m)}</strong>
                    </span>
                  )}
                  {m && m.sides.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      Sides
                      {m.sides.map((s, i) => (
                        <span key={i} className="rounded bg-[rgba(255,255,255,0.08)] px-1.5 tabular-nums">
                          {fmtLen(s)}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                {m?.crosses && <p className="col-span-3 m-0 text-label text-[color:var(--color-danger,#fda4af)]">The outline crosses itself.</p>}
              </div>
            )}
          </section>

          <section className="glass flex flex-col gap-3 p-4">
            <h2 className="m-0 text-body font-semibold text-fg">3. About this field</h2>
            <label className="flex flex-col gap-1 text-label font-semibold text-fg-2">
              Field name
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. North canal plot" maxLength={80} required />
            </label>
            <label className="flex flex-col gap-1 text-label font-semibold text-fg-2">
              Address or landmark
              <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
            </label>
            <Select
              label="What do you grow now?"
              value={rotation}
              onChange={setRotation}
              options={[['', region.data ? 'Choose your current rotation' : 'Mark the field to see options'], ...((region.data?.rotations ?? []).map((r) => [r.rotation_id, r.label]) as [string, string][])]}
              hint={region.isError ? (region.error as Error).message.replace(/^\d+\s*/, '') : region.data ? `Rotations for ${region.data.region_name}` : undefined}
            />
            <Select
              label="Irrigation"
              value={irrigation}
              onChange={(v) => setIrrigation(v as Irrigation)}
              options={[['none', 'None (rain only)'], ['limited', 'Limited (some watering)'], ['reliable', 'Reliable (water when needed)']]}
            />
            <Select
              label="Main water source"
              value={waterSource}
              onChange={setWaterSource}
              options={[['', 'Not sure / skip'], ['canal', 'Canal'], ['tubewell', 'Tubewell / borehole'], ['rain', 'Rain only'], ['river', 'River or stream'], ['mixed', 'Mixed']]}
            />
            <Select
              label="Soil type (if you know it)"
              value={soilType}
              onChange={setSoilType}
              options={[['', "Don't know"], ['sandy', 'Sandy'], ['loam', 'Loam'], ['clay', 'Clay'], ['silty', 'Silty'], ['saline', 'Salty / saline']]}
            />
            <Select
              label="Most important to you"
              value={goal}
              onChange={setGoal}
              options={[['', 'Skip'], ['water', 'Saving water'], ['soil', 'Healthier soil'], ['income', 'More income'], ['resilience', 'Safer against bad weather'], ['fodder', 'Fodder for animals']]}
            />
            <fieldset className="m-0 flex min-w-0 flex-col gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] p-3">
              <legend className="px-1 text-label font-semibold text-fg-2">Equipment or help I do NOT have</legend>
              <p className="m-0 text-label text-fg-3">
                Tick what you cannot get. Rotations that need it are marked as not fitting your farm. Leave all empty if you are not sure.
              </p>
              {EQUIPMENT_IDS.map((eid) => {
                const on = unavail.includes(eid)
                const hintId = `equip-hint-${eid}`
                return (
                  <label
                    key={eid}
                    className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[var(--radius-control)] px-2 py-2 transition-colors hover:bg-[rgba(255,255,255,0.05)] ${on ? 'bg-[rgba(253,164,175,0.08)]' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 shrink-0 accent-[color:var(--color-accent,#4ade80)]"
                      checked={on}
                      aria-describedby={hintId}
                      onChange={(e) =>
                        setUnavail((cur) =>
                          e.target.checked ? EQUIPMENT_IDS.filter((x) => x === eid || cur.includes(x)) : cur.filter((x) => x !== eid),
                        )
                      }
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-label font-semibold text-fg">{EQUIPMENT_COPY[eid].label}</span>
                      <span id={hintId} className="text-label text-fg-3">
                        {EQUIPMENT_COPY[eid].hint}
                      </span>
                    </span>
                  </label>
                )
              })}
            </fieldset>
            <label className="flex flex-col gap-1 text-label font-semibold text-fg-2">
              Machines you have
              <input className={inputCls} value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="e.g. tractor, seed drill" maxLength={200} />
            </label>
            <label className="flex flex-col gap-1 text-label font-semibold text-fg-2">
              Where you sell
              <input className={inputCls} value={market} onChange={(e) => setMarket(e.target.value)} placeholder="e.g. local mandi, sugar mill" maxLength={200} />
            </label>
            <label className="flex flex-col gap-1 text-label font-semibold text-fg-2">
              Notes
              <textarea className={`${inputCls} min-h-[80px] py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
            </label>
          </section>

          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="lg" icon={Save} loading={save.isPending} disabled={!shape || !name.trim()}>
              {fieldId ? 'Save changes' : 'Save field'}
            </Button>
            {fieldId && (
              <Button
                variant="ghost"
                icon={Trash2}
                loading={del.isPending}
                onClick={async () => {
                  if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
                  await del.mutateAsync(fieldId)
                  navigate('/my-fields')
                }}
              >
                Delete field
              </Button>
            )}
          </div>
        </form>

        {/* ---------------------------------------------------------------- map */}
        <section aria-label="Field drawing map" className="glass relative order-1 h-[clamp(380px,62dvh,720px)] min-w-0 overflow-hidden p-0 lg:sticky lg:top-6 lg:order-2">
          <DrawMap
            mode={mode}
            shape={shape}
            draft={draft}
            onDraft={setDraft}
            onShape={(s) => {
              setShape(s)
              if (s) setMode(null)
            }}
            flyTarget={fly}
            fitOnLoad={!!fieldId}
            tiles={tiles}
          />
          <div className="glass-strong absolute right-3 top-3 z-[1000] rounded-full p-1">
            <SegmentedControl
              label="Map style"
              value={tiles}
              onChange={setTiles}
              options={[
                { value: 'satellite', label: 'Satellite' },
                { value: 'map', label: 'Map' },
              ]}
            />
          </div>
          {mode && (
            <p className="glass-strong pointer-events-none absolute bottom-3 left-3 right-3 z-[1000] m-0 rounded-[var(--radius-control)] p-2 text-label font-semibold text-fg">
              {HELP[mode]}
              {mode === 'circle' && draft.length === 1 ? ' Now click the edge.' : ''}
              {mode === 'rectangle' && draft.length === 1 ? ' Now click the opposite corner.' : ''}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
