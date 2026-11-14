import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, RotateCw, Sprout } from 'lucide-react'
import { useProfile } from '../api/hooks'
import type { FieldInfo, Quality } from '../types/api'
import DataQualityBadge from './DataQualityBadge'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Notice } from './ui/Notice'
import { Skeleton } from './ui/Skeleton'
import { buttonClasses } from './ui/buttonStyles'
import { cn } from './ui/cn'

function Row({ field, selected, onSelect }: { field: FieldInfo; selected: boolean; onSelect: (id: string) => void }) {
  // Status badge = provenance of the field's data (demo / observed), from its profile.
  const { data, isLoading, isError } = useProfile(field.field_id)
  const quality: Quality = data && !isError ? data.data_mode : 'unavailable'
  const title = `${field.field_id} · ${field.name}`

  // Keep the selected row visible inside the list's own scroll area (never scrolls the page).
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    const li = ref.current
    const box = li?.closest<HTMLElement>('[data-scroll-area]')
    if (!selected || !li || !box || box.scrollHeight <= box.clientHeight) return
    const top = li.offsetTop // box is position:relative, so this is relative to it
    if (top < box.scrollTop || top + li.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' })
    }
  }, [selected])

  return (
    <li
      ref={ref}
      className={cn(
        'glass-flat rounded-[var(--radius-control)] transition-[border-color,box-shadow,background-color] duration-150',
        selected
          ? 'border-accent! bg-accent/12! shadow-[var(--shadow-glow)]'
          : 'has-[button:hover]:border-control-border',
      )}
    >
      {/* Row button and the Compare link are siblings (no interactive content inside a button). */}
      <button
        type="button"
        onClick={() => onSelect(field.field_id)}
        aria-pressed={selected}
        className="flex min-h-[72px] w-full min-w-0 flex-col justify-center gap-1 rounded-[var(--radius-control)] p-4 text-left"
      >
        <span className="flex w-full min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-body font-semibold text-fg" title={title}>
            {title}
          </span>
          <DataQualityBadge quality={quality} loading={isLoading} />
        </span>
        <span className="line-clamp-2 text-label font-normal text-fg-3">
          {field.region_id} · {field.soil_type ?? 'soil n/a'} · irrigation: {field.irrigation}
        </span>
      </button>
      {selected && (
        <div className="px-4 pb-4">
          <Link to={`/fields/${field.field_id}`} className={cn(buttonClasses('primary'), 'w-full sm:w-auto')}>
            Compare rotations
            <ArrowRight size={20} strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
      )}
    </li>
  )
}

interface Props {
  fields: FieldInfo[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Optional list states (Overview passes the query state). */
  isLoading?: boolean
  error?: unknown
  onRetry?: () => void
  className?: string
}

export default function FieldList({ fields, selectedId, onSelect, isLoading = false, error, onRetry, className }: Props) {
  let body
  if (isLoading) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">Loading fields</span>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} preset="row" />
        ))}
      </div>
    )
  } else if (error) {
    body = (
      <Notice
        tone="error"
        title="Could not load fields"
        actions={
          onRetry && (
            <Button variant="ghost" icon={RotateCw} onClick={onRetry}>
              Reload fields
            </Button>
          )
        }
      >
        The field data did not load. Check your connection, then try again.
      </Notice>
    )
  } else if (fields.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
        <Sprout size={24} strokeWidth={1.75} aria-hidden className="text-fg-3" />
        <h3 className="m-0 font-display text-heading font-semibold text-fg">No fields to show</h3>
        <p className="m-0 text-body text-fg-2">
          The field list is empty. Check that the demo data loaded, then refresh the page.
        </p>
      </div>
    )
  } else {
    body = (
      <ul data-component="FieldList" className="m-0 flex list-none flex-col gap-2 p-0">
        {fields.map((f) => (
          <Row key={f.field_id} field={f} selected={f.field_id === selectedId} onSelect={onSelect} />
        ))}
      </ul>
    )
  }

  return (
    <section
      data-component="FieldListCard"
      aria-labelledby="field-list-title"
      className={cn('glass flex min-h-0 min-w-0 flex-col p-4 md:p-6', className)}
    >
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="field-list-title" className="m-0 font-display text-heading font-semibold text-fg">
            Fields
          </h2>
          {!isLoading && !error && <Badge tone="neutral">{fields.length}</Badge>}
        </div>
        {!selectedId && !isLoading && !error && fields.length > 0 && (
          <p className="m-0 text-label font-normal text-fg-3">
            Select a field on the map or in the list to see its boundary and compare rotations.
          </p>
        )}
      </div>
      <div data-scroll-area className="relative -mx-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">{body}</div>
    </section>
  )
}
