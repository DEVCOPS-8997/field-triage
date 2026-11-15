import { Link } from 'react-router-dom'
import { ArrowRight, Droplets, MapPin, Pencil, Plus, Ruler } from 'lucide-react'
import { equipParam, useMyFields, type MyField } from '../api/account'
import PageHeader from '../components/shell/PageHeader'
import { Notice } from '../components/ui/Notice'
import { Skeleton } from '../components/ui/Skeleton'
import { buttonClasses } from '../components/ui/buttonStyles'
import { fmtArea, fmtLen, type LonLat } from '../lib/geo/measure'
import { accountsEnabled } from '../lib/supabase'
import { useAuth } from '../store/useAuth'
import { AccountsNotConfigured } from './Account'

const IRR = { none: 'Rain only', limited: 'Limited irrigation', reliable: 'Reliable irrigation' } as const

/** Small outline drawing of the field (true proportions, north up). */
function ShapePreview({ field }: { field: MyField }) {
  if (field.shape_type === 'circle') {
    return (
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
        <circle cx="50" cy="50" r="40" fill="rgba(190,242,100,0.22)" stroke="#BEF264" strokeWidth="3" />
      </svg>
    )
  }
  const ring: LonLat[] = field.shape.coordinates ?? []
  const k = Math.cos((field.center.lat * Math.PI) / 180) // shrink longitude so shapes are not stretched
  const xs = ring.map((p) => p[0] * k)
  const ys = ring.map((p) => -p[1])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const span = Math.max(maxX - minX, maxY - minY) || 1
  const pts = ring
    .map((_, i) => `${10 + ((xs[i] - minX) / span) * 80 + (80 - ((maxX - minX) / span) * 80) / 2},${10 + ((ys[i] - minY) / span) * 80 + (80 - ((maxY - minY) / span) * 80) / 2}`)
    .join(' ')
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <polygon points={pts} fill="rgba(190,242,100,0.22)" stroke="#BEF264" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  )
}

function analyzeHref(f: MyField) {
  return (
    `/location?lat=${f.center.lat.toFixed(5)}&lon=${f.center.lon.toFixed(5)}&field=${f.id}&name=${encodeURIComponent(f.name)}` +
    `&area_ha=${f.area_ha.toFixed(4)}&irrigation=${f.irrigation}` +
    (f.current_rotation_id ? `&rotation=${f.current_rotation_id}` : '') +
    equipParam(f.unavailable_equipment)
  )
}

function FieldCard({ field }: { field: MyField }) {
  const a = fmtArea(field.area_m2)
  return (
    <li className="glass flex min-w-0 flex-col gap-4 p-4 transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-0.5">
      <div className="flex min-w-0 gap-4">
        <div className="size-[84px] shrink-0 rounded-[var(--radius-control)] bg-[rgba(0,0,0,0.25)] p-1">
          <ShapePreview field={field} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="m-0 truncate text-body font-semibold text-fg">{field.name}</h2>
          {field.address && (
            <p className="m-0 flex items-start gap-1 text-label text-fg-3">
              <MapPin size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span className="line-clamp-2">{field.address}</span>
            </p>
          )}
          <p className="m-0 text-[24px] font-semibold leading-tight text-fg tabular-nums">
            {a.ha} <span className="text-label font-normal text-fg-3">ha</span>
            <span className="ml-2 text-label font-normal text-fg-2">({a.acres} acres)</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-label text-fg-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-1 tabular-nums">
          <Ruler size={14} aria-hidden /> {a.m2} m² · perimeter {fmtLen(field.perimeter_m)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-1">
          <Droplets size={14} aria-hidden /> {IRR[field.irrigation]}
        </span>
      </div>
      <div className="mt-auto flex gap-2">
        <Link to={analyzeHref(field)} className={`${buttonClasses('primary')} flex-1`}>
          Analyze <ArrowRight size={18} strokeWidth={1.75} aria-hidden />
        </Link>
        <Link to={`/my-fields/${field.id}`} className={buttonClasses('secondary')} aria-label={`Edit ${field.name}`}>
          <Pencil size={18} strokeWidth={1.75} aria-hidden /> Edit
        </Link>
      </div>
    </li>
  )
}

export default function MyFields() {
  const user = useAuth((s) => s.user)
  const ready = useAuth((s) => s.ready)
  const { data, isLoading, error } = useMyFields()

  if (!accountsEnabled) return <AccountsNotConfigured />
  if (ready && !user) {
    return (
      <Notice tone="info" title="Sign in to see your fields" actions={<Link to="/account?next=/my-fields" className={buttonClasses('primary')}>Sign in or create account</Link>}>
        Saved fields belong to your account and are private to you.
      </Notice>
    )
  }

  const fields = data ?? []
  const totalM2 = fields.reduce((s, f) => s + f.area_m2, 0)

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="My fields"
        subtitle={
          fields.length
            ? `${fields.length} field${fields.length === 1 ? '' : 's'} · ${fmtArea(totalM2).ha} ha in total (${fmtArea(totalM2).acres} acres)`
            : 'Add each field you farm. Sizes can differ, and every field gets its own advice.'
        }
        trailing={
          <Link to="/my-fields/new" className={buttonClasses('primary')}>
            <Plus size={20} strokeWidth={1.75} aria-hidden /> Add field
          </Link>
        }
      />
      {error && <Notice tone="error">{(error as Error).message}</Notice>}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[220px] rounded-[var(--radius-card,1.5rem)]" />
          ))}
        </div>
      ) : fields.length === 0 ? (
        <Link
          to="/my-fields/new"
          className="glass flex flex-col items-center gap-3 border-2 border-dashed p-10 text-center no-underline hover:bg-[rgba(255,255,255,0.06)]"
        >
          <Plus size={36} strokeWidth={1.5} aria-hidden className="text-accent" />
          <span className="text-heading font-semibold text-fg">Add your first field</span>
          <span className="max-w-[46ch] text-body text-fg-2">
            Search your village, draw the field as a free shape, rectangle or circle, and we work out its exact size.
          </span>
        </Link>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
          {fields.map((f) => (
            <FieldCard key={f.id} field={f} />
          ))}
        </ul>
      )}
    </div>
  )
}
