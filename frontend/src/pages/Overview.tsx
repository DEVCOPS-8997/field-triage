import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MapPinned, MousePointerClick, Plus, Ruler, Search, UserPlus } from 'lucide-react'
import type { FieldInfo } from '../types/api'
import { useMyFields, type MyField } from '../api/account'
import FieldMap from '../components/FieldMap'
import PageHeader from '../components/shell/PageHeader'
import { buttonClasses } from '../components/ui/buttonStyles'
import { fmtArea } from '../lib/geo/measure'
import { accountsEnabled } from '../lib/supabase'
import { useAuth } from '../store/useAuth'
import { useI18n } from '../lib/i18n'

/** Saved field -> the shape FieldMap draws. */
function toFieldInfo(f: MyField): FieldInfo {
  return {
    field_id: String(f.id),
    name: f.name,
    region_id: '',
    location: { lat: f.center.lat, lon: f.center.lon },
    soil_type: null,
    irrigation: f.irrigation,
    market_access: null,
    current_rotation_id: f.current_rotation_id ?? '',
    geometry: f.geojson,
  } as FieldInfo
}

function analyzeHref(f: MyField) {
  return (
    `/location?lat=${f.center.lat.toFixed(5)}&lon=${f.center.lon.toFixed(5)}&field=${f.id}&name=${encodeURIComponent(f.name)}` +
    `&area_ha=${f.area_ha.toFixed(4)}&irrigation=${f.irrigation}` +
    (f.current_rotation_id ? `&rotation=${f.current_rotation_id}` : '')
  )
}

function GuestPanel() {
  const { t } = useI18n()
  return (
    <section className="glass flex min-w-0 flex-col gap-5 p-5" aria-label={t('overview.howToStart')}>
      <h2 className="m-0 text-heading font-semibold text-fg">{t('overview.checkAnyPlace')}</h2>
      <ol className="m-0 flex list-none flex-col gap-4 p-0 text-body text-fg-2">
        <li className="flex gap-3">
          <Search size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          <span>{t('overview.stepSearch')}</span>
        </li>
        <li className="flex gap-3">
          <MousePointerClick size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          <span>{t('overview.stepPin')}</span>
        </li>
      </ol>
      {accountsEnabled && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-accent/30 bg-accent/8 p-4">
          <p className="m-0 flex items-start gap-2 text-body text-fg">
            <MapPinned size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-accent" />
            <span>{t('overview.ownFieldsPitch')}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/account" className={buttonClasses('primary')}>
              <UserPlus size={20} strokeWidth={1.75} aria-hidden /> {t('nav.createAccount')}
            </Link>
            <Link to="/account?mode=login" className={buttonClasses('secondary')}>
              {t('nav.signIn')}
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}

function MyFieldsPanel({ fields, loading, selectedId, onSelect }: {
  fields: MyField[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { t, tn } = useI18n()
  const total = fields.reduce((s, f) => s + f.area_m2, 0)
  return (
    <section className="glass flex min-h-0 min-w-0 flex-col gap-3 p-4" aria-label={t('overview.myFields')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-heading font-semibold text-fg">{t('overview.myFields')}</h2>
        <Link to="/my-fields/new" className={buttonClasses('primary')}>
          <Plus size={18} strokeWidth={1.75} aria-hidden /> {t('common.add')}
        </Link>
      </div>
      {fields.length > 0 && (
        <p className="m-0 text-label text-fg-3 tabular-nums">
          {tn('overview.fieldCount', fields.length)} ·{' '}
          {t('common.areaHaAcres', { ha: fmtArea(total).ha, acres: fmtArea(total).acres })}
        </p>
      )}
      {loading ? (
        <p className="m-0 text-label text-fg-3">{t('overview.loadingFields')}</p>
      ) : fields.length === 0 ? (
        <Link to="/my-fields/new" className="flex flex-col items-center gap-2 rounded-[var(--radius-control)] border-2 border-dashed border-accent/40 p-6 text-center no-underline hover:bg-accent/8">
          <Plus size={28} aria-hidden className="text-accent" />
          <span className="font-semibold text-fg">{t('overview.addFirst')}</span>
          <span className="text-label text-fg-2">{t('overview.addFirstHint')}</span>
        </Link>
      ) : (
        <ul className="m-0 flex min-h-0 list-none flex-col gap-2 overflow-y-auto p-0">
          {fields.map((f) => {
            const on = String(f.id) === selectedId
            return (
              <li key={f.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSelect(String(f.id))}
                  className={`flex w-full flex-col gap-1 rounded-[var(--radius-control)] border p-3 text-start ${on ? 'border-accent bg-accent/12' : 'border-transparent bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)]'}`}
                >
                  <span className="font-semibold text-fg">{f.name}</span>
                  <span className="flex items-center gap-1 text-label text-fg-2 tabular-nums">
                    <Ruler size={14} aria-hidden />{' '}
                    {t('common.areaHaDotAcres', { ha: fmtArea(f.area_m2).ha, acres: fmtArea(f.area_m2).acres })}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default function Overview() {
  const user = useAuth((s) => s.user)
  const { t } = useI18n()
  const { data, isLoading } = useMyFields()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const mine = useMemo(() => (user ? data ?? [] : []), [user, data])
  const mapFields = useMemo(() => mine.map(toFieldInfo), [mine])
  const byId = useMemo(() => new Map(mine.map((f) => [String(f.id), f])), [mine])

  return (
    <div data-page="Overview" className="flex min-w-0 flex-col">
      <PageHeader
        title={user ? t('overview.welcome', { name: user.name }) : t('overview.titleGuest')}
        subtitle={user ? t('overview.subtitleUser') : t('overview.subtitleGuest')}
      />

      <div className="flex min-w-0 flex-col gap-4 md:gap-6 lg:grid lg:h-[max(560px,calc(100dvh-260px))] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <section aria-label={t('overview.mapLabel')} className="glass order-1 h-[clamp(320px,56dvh,520px)] min-w-0 overflow-hidden p-0 lg:order-2 lg:h-full">
          <FieldMap
            fields={mapFields}
            selectedId={selectedId}
            onSelect={setSelectedId}
            isLoading={!!user && isLoading}
            note={user ? (mine.length ? t('overview.savedOutlined') : null) : null}
            selectedCard={(fi) => {
              const f = byId.get(fi.field_id)
              if (!f) return null
              return (
                <div className="glass-strong flex min-w-0 flex-col gap-2 rounded-[var(--radius-control)] p-4 sm:max-w-[360px]">
                  <p className="m-0 truncate text-body font-semibold text-fg">{f.name}</p>
                  <p className="m-0 text-label text-fg-2 tabular-nums">
                    {t('common.areaHaDotAcres', { ha: fmtArea(f.area_m2).ha, acres: fmtArea(f.area_m2).acres })}
                  </p>
                  <div className="flex gap-2">
                    <Link to={analyzeHref(f)} className={`${buttonClasses('primary')} flex-1`}>
                      {t('common.analyze')} <ArrowRight size={18} strokeWidth={1.75} aria-hidden />
                    </Link>
                    <Link to={`/my-fields/${f.id}`} className={buttonClasses('secondary')}>
                      {t('common.edit')}
                    </Link>
                  </div>
                </div>
              )
            }}
          />
        </section>
        <div className="order-2 flex min-h-0 min-w-0 flex-col lg:order-1">
          {user ? <MyFieldsPanel fields={mine} loading={isLoading} selectedId={selectedId} onSelect={setSelectedId} /> : <GuestPanel />}
        </div>
      </div>
    </div>
  )
}
