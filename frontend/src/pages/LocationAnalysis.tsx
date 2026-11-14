import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Info, Loader2, TriangleAlert } from 'lucide-react'
import { api } from '../api/client'
import RotationCard from '../components/RotationCard'
import Disclaimer from '../components/Disclaimer'
import { Badge, Card } from '../lib/ui4/primitives'
import { ConfidencePill } from '../lib/ui/Pill'
import type { LocationCompareResponse } from '../types/api'

const sectionTitle = 'm-0 text-[1.25rem] font-semibold text-[color:var(--color-fg,#ecfdf3)]'
const muted = 'm-0 text-[0.875rem] text-[color:var(--color-fg-2,#A7C4B5)]'
const fieldCls =
  'min-h-[44px] w-full rounded-[var(--radius-control,1rem)] border border-[color:var(--color-control-border,rgba(190,242,220,0.45))] bg-[rgba(255,255,255,0.04)] px-3 text-[color:var(--color-fg,#ecfdf3)]'

type Irrigation = 'none' | 'limited' | 'reliable'

const IRRIGATION: { v: Irrigation; label: string }[] = [
  { v: 'none', label: 'None (rain only)' },
  { v: 'limited', label: 'Limited' },
  { v: 'reliable', label: 'Reliable' },
]

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

  const [irrigation, setIrrigation] = useState<Irrigation>('limited')
  const [rotationId, setRotationId] = useState('')

  const region = useQuery({
    queryKey: ['location-region', lat, lon],
    queryFn: () => api.locationRegion(lat, lon),
    enabled: validCoords,
    retry: false,
  })
  const regionRotations = region.data?.rotations ?? []

  const analyze = useMutation({
    mutationFn: () =>
      api.compareLocation({
        location: { lat, lon },
        irrigation,
        current_rotation_id: rotationId,
      }),
  })

  const back = (
    <Link to="/" className="inline-flex items-center gap-2 text-[var(--color-accent,#4ADE80)] underline">
      <ArrowLeft size={16} aria-hidden /> Back to map
    </Link>
  )

  if (!validCoords) {
    return (
      <div className="space-y-4 p-4 md:p-8">
        <h1 className={sectionTitle}>No location selected</h1>
        <p className={muted}>Pick a point on the map first (use GPS, search, or click the map).</p>
        {back}
      </div>
    )
  }

  const data: LocationCompareResponse | undefined = analyze.data
  const ranked = [...(data?.rotations ?? [])].sort((a, b) => a.rank - b.rank)

  return (
    <div className="space-y-6 p-4 md:p-8">
      {back}
      <header className="space-y-1">
        <h1 className={sectionTitle}>Location analysis</h1>
        <p className={muted}>
          {lat.toFixed(5)}, {lon.toFixed(5)}
        </p>
      </header>

      <Card title="About your field">
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (rotationId) analyze.mutate()
          }}
        >
          <label className="flex flex-col gap-1 text-[0.875rem]">
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
            <span className="text-[0.75rem] text-[color:var(--color-fg-3,#7d9a8b)]">
              {region.data
                ? `Rotations for ${region.data.region_name}.`
                : 'Rotations are listed for the region that contains this point.'}
            </span>
          </label>
          <label className="flex flex-col gap-1 text-[0.875rem]">
            Irrigation
            <select className={fieldCls} value={irrigation} onChange={(e) => setIrrigation(e.target.value as Irrigation)}>
              {IRRIGATION.map((i) => (
                <option key={i.v} value={i.v}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!rotationId || analyze.isPending}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-control,1rem)] border px-5 font-semibold disabled:opacity-50"
            >
              {analyze.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {analyze.isPending ? 'Fetching NASA data…' : 'Analyze this location'}
            </button>
            {analyze.isPending && (
              <p className={`${muted} mt-2`} role="status">
                The first request for an area downloads about 20 years of NASA POWER data and can take 10 seconds or more.
              </p>
            )}
          </div>
        </form>
      </Card>

      {region.error && (
        <div role="alert" className="flex items-start gap-2 rounded-[var(--radius-control,1rem)] border p-4">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p className="m-0 font-semibold">Could not load rotations for this location</p>
            <p className={muted}>
              {(region.error as Error).message === 'Failed to fetch'
                ? 'Cannot reach the API (network or CORS error). Check that the backend is running and allows this origin.'
                : (region.error as Error).message}
            </p>
            <button
              type="button"
              onClick={() => region.refetch()}
              className="inline-flex min-h-[44px] items-center rounded-[var(--radius-control,1rem)] border px-4 font-semibold"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {analyze.error && (
        <div role="alert" className="flex items-start gap-2 rounded-[var(--radius-control,1rem)] border p-4">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
          <div>
            <p className="m-0 font-semibold">Could not analyze this location</p>
            <p className={muted}>{(analyze.error as Error).message}</p>
          </div>
        </div>
      )}

      {data && (
        <section className="space-y-4" aria-label="Results">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warn" icon={Info}>
              Estimated from NASA gridded data
            </Badge>
            <Badge>{data.location.region_name}</Badge>
            <Badge title="Where the NASA data came from">
              {data.data_retrieval.source}
              {data.data_retrieval.stale ? ' (stale)' : ''}
            </Badge>
          </div>
          <p className={muted}>{data.location.data_resolution_note}</p>
          <p className={muted}>
            NASA POWER {data.data_retrieval.period_start} to {data.data_retrieval.period_end}, fetched{' '}
            {data.data_retrieval.fetched_at.slice(0, 10)}.
          </p>

          {data.warnings.length > 0 && (
            <Card title="Data limits and warnings">
              <ul className="m-0 list-disc space-y-1 pl-5 text-[0.875rem]">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Card>
          )}

          <ol className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Rotations, best first">
            {ranked.map((r) => (
              <li key={r.rotation_id} className="space-y-3">
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className={sectionTitle}>
                      #{r.rank} {r.label}
                      {r.is_existing ? ' (your current rotation)' : ''}
                    </h2>
                    <ConfidencePill confidence={r.confidence} />
                  </div>
                  <p className={muted}>
                    Overall {r.overall.toFixed(0)} (historical range {r.overall_low.toFixed(0)} to{' '}
                    {r.overall_high.toFixed(0)})
                  </p>
                  <ul className="m-0 mt-2 grid list-none grid-cols-2 gap-2 p-0 text-[0.875rem] md:grid-cols-4">
                    {(['water', 'soil', 'income', 'resilience'] as const).map((k) => (
                      <li key={k}>
                        <span className="capitalize">{k}</span>:{' '}
                        {typeof r.scores[k] === 'number' ? r.scores[k].toFixed(0) : 'unavailable'}
                      </li>
                    ))}
                  </ul>
                </Card>
                <RotationCard rotation={r} />
              </li>
            ))}
          </ol>
          <Disclaimer variant="inline" text={data.disclaimer} />
        </section>
      )}
    </div>
  )
}
