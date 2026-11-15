import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCompare, useFields, useProfile } from '../api/hooks'
import PriorityPanel from '../components/PriorityPanel'
import ScenarioPanel from '../components/ScenarioPanel'
import RotationCompare from '../components/RotationCompare'
import RotationCard from '../components/RotationCard'
import ScoreRadar from '../components/ScoreRadar'
import ClimateCharts from '../components/ClimateCharts'
import ProvenanceBar from '../components/ProvenanceBar'
import IllustrativeBadge from '../components/IllustrativeBadge'
import NowCard from '../components/NowCard'
import Disclaimer from '../components/Disclaimer'
import { Ltr } from '../components/ui/Ltr'
import { hasKey, useI18n, type TranslationKey } from '../lib/i18n'

const sectionTitle = 'font-display text-heading font-semibold text-[var(--color-fg,#ECFDF3)]'

export default function FieldDetail() {
  const { fieldId } = useParams()
  const { t } = useI18n()
  const fields = useFields()
  const profile = useProfile(fieldId)
  const compare = useCompare(fieldId)
  const field = fields.data?.find((f) => f.field_id === fieldId)

  if (profile.isLoading) {
    return (
      <div className="p-4 md:p-8" aria-busy="true">
        <p className="text-[var(--color-fg-2,#A7C4B5)]">{t('fieldDetail.loading', { id: fieldId ?? '' })}</p>
      </div>
    )
  }
  if (profile.error || !profile.data) {
    return (
      <div className="space-y-4 p-4 md:p-8">
        <h1 className={sectionTitle}>{t('fieldDetail.errorTitle')}</h1>
        <p className="text-[var(--color-fg-2,#A7C4B5)]">{t('fieldDetail.errorBody', { id: fieldId ?? '' })}</p>
        <Link to="/" className="inline-flex items-center gap-2 text-[var(--color-accent,#4ADE80)] underline">
          <ArrowLeft size={16} aria-hidden /> {t('fieldDetail.backToOverview')}
        </Link>
      </div>
    )
  }

  const p = profile.data
  const irrigationKey = field ? `glossary.irrigation.${field.irrigation}` : ''
  const irrigation = field ? (hasKey(irrigationKey) ? t(irrigationKey as TranslationKey) : field.irrigation) : ''

  return (
    <div data-page="FieldDetail" className="mx-auto max-w-[1440px] space-y-8 p-4 md:p-8">
      <header className="space-y-3">
        <Link
          to={`/?field=${fieldId}`}
          className="inline-flex min-h-11 items-center gap-2 text-[14px] text-[var(--color-fg-2,#A7C4B5)] hover:text-[var(--color-fg,#ECFDF3)]"
        >
          <ArrowLeft size={16} aria-hidden /> {t('nav.overview')}
        </Link>
        <p className="text-[14px] text-[var(--color-fg-3,#7FA392)]">
          {field
            ? t('fieldDetail.meta', {
                region: field.region_id,
                soil: field.soil_type ?? t('fieldDetail.soilNA'),
                irrigation,
              })
            : t('fieldDetail.field')}
        </p>
        <h1 className="font-display text-display font-semibold leading-tight text-[var(--color-fg,#ECFDF3)]" tabIndex={-1}>
          {field ? (
            <>
              <Ltr>{field.field_id}</Ltr> · {field.name}
            </>
          ) : (
            t('fieldDetail.fieldN', { id: fieldId ?? '' })
          )}
        </h1>
        <ProvenanceBar
          dataMode={p.data_mode}
          dataQuality={p.data_quality}
          dataSources={p.data_sources}
          periodStart={p.period_start}
          periodEnd={p.period_end}
        />
      </header>

      {/* Primary focal point: rotation comparison driven by priorities and scenario */}
      <section aria-label={t('fieldDetail.comparisonLabel')} className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-[14px] text-[var(--color-fg-2,#A7C4B5)]">
          <IllustrativeBadge />
          <span>{t('fieldDetail.illustrativeNote')}</span>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <PriorityPanel />
          <ScenarioPanel scenarioApplied={compare.data?.scenario_applied} />
        </div>
        <RotationCompare fieldId={fieldId!} renderDetail={(r) => <RotationCard rotation={r} />} />
      </section>

      {compare.data && compare.data.rotations.length > 0 && (
        <section aria-label={t('fieldDetail.profileLabel')} className="grid min-w-0 gap-6 xl:grid-cols-2">
          <ScoreRadar rotations={compare.data.rotations} />
          <NowCard now={p.now} dataQuality={p.data_quality} />
        </section>
      )}

      <section aria-labelledby="climate-h" className="space-y-4">
        <h2 id="climate-h" className={sectionTitle}>
          {t('fieldDetail.climateTitle', { years: p.n_years })}
        </h2>
        <ClimateCharts profile={p} />
      </section>

      <Disclaimer variant="inline" text={compare.data?.disclaimer} />
    </div>
  )
}
