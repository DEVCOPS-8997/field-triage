import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Globe, Map as MapIcon, MapPin } from 'lucide-react'
import { useFields } from '../api/hooks'
import { useAppStore } from '../store/useAppStore'
import FieldList from '../components/FieldList'
import FieldMap from '../components/FieldMap'
import PageHeader from '../components/shell/PageHeader'
import { KPITile } from '../components/ui/KPITile'

export default function Overview() {
  const { data: fields, isLoading, error, refetch } = useFields()
  const selectedId = useAppStore((s) => s.selectedFieldId)
  const selectField = useAppStore((s) => s.selectField)

  // Deep link: /?field=F05 preselects a field.
  const [params] = useSearchParams()
  const paramId = params.get('field')
  useEffect(() => {
    if (paramId) selectField(paramId)
  }, [paramId, selectField])

  useEffect(() => {
    if (error) console.error('Failed to load fields', error)
  }, [error])

  const list = useMemo(() => fields ?? [], [fields])
  const regions = useMemo(() => new Set(list.map((f) => f.region_id)).size, [list])

  return (
    <div data-page="Overview" className="flex min-w-0 flex-col">
      <PageHeader title="Field overview" subtitle="Choose a field to compare crop rotations side by side." />

      <div className="mb-4 grid grid-cols-3 gap-2 md:mb-6 md:gap-6">
        <KPITile icon={MapIcon} label="Fields" value={error ? null : list.length} isLoading={isLoading} />
        <KPITile icon={Globe} label="Regions" value={error ? null : regions} isLoading={isLoading} />
        <KPITile icon={MapPin} label="Selected" value={selectedId ?? 'None'} isLoading={isLoading} />
      </div>

      <div className="flex min-w-0 flex-col gap-4 md:gap-6 lg:grid lg:h-[max(520px,calc(100dvh-340px))] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <section
          aria-label="Field map"
          className="glass order-1 h-[clamp(320px,56dvh,480px)] min-w-0 overflow-hidden p-0 lg:order-2 lg:h-full"
        >
          <FieldMap fields={list} selectedId={selectedId} onSelect={selectField} isLoading={isLoading} />
        </section>
        <FieldList
          className="order-2 lg:order-1 lg:h-full"
          fields={list}
          selectedId={selectedId}
          onSelect={selectField}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
        />
      </div>
    </div>
  )
}
