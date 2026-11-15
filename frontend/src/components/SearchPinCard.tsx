/**
 * SearchPinCard: details for a searched place or typed coordinates.
 * Shows the address, admin region chain, coordinates (copyable) and the nearest pilot field.
 * It suggests the nearest field but never selects it on its own.
 */
import { useMemo, useState } from 'react'
import { Check, Copy, MapPin, Navigation, X } from 'lucide-react'
import type { FieldInfo } from '../types/api'
import { distanceKm, formatDistance, formatLatLon, plainLatLon } from '../lib/geo/coords'
import { kindLabel, regionLine, streetLine, type Place } from '../lib/geo/geocode'
import { regionName } from '../lib/geo/regions'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { Skeleton } from './ui/Skeleton'
import { Ltr } from './ui/Ltr'
import { hasKey, useI18n, type TranslationKey } from '../lib/i18n'

export interface SearchPin {
  lat: number
  lon: number
  /** place picked from suggestions, or the reverse-geocoded place for typed coordinates */
  place: Place | null
  source: 'place' | 'coords'
  status: 'ready' | 'loading' | 'error'
  swapped?: boolean
}

/** Beyond this, the nearest pilot field is too far to be a meaningful stand-in. */
const NEAR_KM = 150

interface Props {
  pin: SearchPin
  fields: FieldInfo[]
  onSelectField: (id: string) => void
  onClose: () => void
  onAnalyze: () => void
}

export default function SearchPinCard({ pin, fields, onSelectField, onClose, onAnalyze }: Props) {
  const [copied, setCopied] = useState(false)
  const { lang, t, rich } = useI18n()
  const kind = (k: string) =>
    lang === 'en' || !hasKey(`mapSearch.kind.${k}`) ? kindLabel(k) : t(`mapSearch.kind.${k}` as TranslationKey)

  const nearest = useMemo(() => {
    let best: { field: FieldInfo; km: number } | null = null
    for (const f of fields) {
      const km = distanceKm(pin.lat, pin.lon, f.location.lat, f.location.lon)
      if (!best || km < best.km) best = { field: f, km }
    }
    return best
  }, [fields, pin.lat, pin.lon])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainLatLon(pin.lat, pin.lon))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the coordinates stay visible to copy by hand */
    }
  }

  const p = pin.place
  const title = pin.source === 'coords' ? t('searchPin.droppedPin') : (p?.name ?? t('searchPin.selectedPlace'))
  const street = p ? streetLine(p) : undefined
  const region = p ? regionLine(p, pin.source === 'coords' || p.kind !== 'city') : ''

  return (
    <div
      data-component="SearchPinCard"
      className="glass-strong flex w-full min-w-0 flex-col gap-2 rounded-[var(--radius-control)] p-4 sm:w-[360px]"
    >
      <div className="flex min-w-0 items-start gap-2">
        <MapPin size={20} strokeWidth={1.75} aria-hidden className="mt-[2px] shrink-0 text-series-extra" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="m-0 truncate text-body font-semibold text-fg" title={title}>
            {title}
          </p>
          {p && pin.source === 'place' && <p className="m-0 text-label text-fg-3">{kind(p.kind)}</p>}
        </div>
        <IconButton label={t('searchPin.clearPin')} icon={X} variant="ghost" tooltipSide="none" onClick={onClose} className="-m-2" />
      </div>

      {/* address and region */}
      {pin.status === 'loading' ? (
        <div className="flex flex-col gap-1" aria-label={t('searchPin.lookingUp')}>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : pin.status === 'error' ? (
        <p className="m-0 text-label text-fg-2">{t('searchPin.lookupError')}</p>
      ) : p ? (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-label">
          {pin.source === 'coords' && (
            <>
              <dt className="text-fg-3">{t('searchPin.near')}</dt>
              <dd className="m-0 truncate text-fg">{p.name}</dd>
            </>
          )}
          {street && street !== p.name && (
            <>
              <dt className="text-fg-3">{t('searchPin.street')}</dt>
              <dd className="m-0 truncate text-fg">{street}</dd>
            </>
          )}
          {region && (
            <>
              <dt className="text-fg-3">{t('searchPin.region')}</dt>
              <dd className="m-0 text-fg">{region}</dd>
            </>
          )}
          {p.postcode && (
            <>
              <dt className="text-fg-3">{t('searchPin.postcode')}</dt>
              <dd className="m-0 text-fg">
                <Ltr>{p.postcode}</Ltr>
              </dd>
            </>
          )}
        </dl>
      ) : (
        <p className="m-0 text-label text-fg-2">{t('searchPin.noAddress')}</p>
      )}

      {/* coordinates */}
      <div className="flex items-center justify-between gap-2 rounded-[var(--radius-chip)] bg-glass-flat px-3 py-1">
        <span dir="ltr" className="ltr min-w-0 truncate font-mono text-label text-fg" title={plainLatLon(pin.lat, pin.lon)}>
          {formatLatLon(pin.lat, pin.lon)}
        </span>
        <IconButton
          label={copied ? t('common.copied') : t('searchPin.copyLatLon')}
          icon={copied ? Check : Copy}
          variant="ghost"
          tooltipSide="top"
          onClick={copy}
          className="-me-2 shrink-0"
          iconClassName={copied ? 'text-accent' : undefined}
        />
      </div>
      {pin.swapped && <p className="m-0 text-label text-fg-3">{t('searchPin.swapped')}</p>}

      {/* live NASA analysis for this exact point */}
      <div className="flex flex-col gap-1 border-t border-glass-border pt-2">
        <Button variant="primary" icon={MapPin} onClick={onAnalyze} className="w-full">
          {t('searchPin.analyze')}
        </Button>
        <p className="m-0 text-label text-fg-3">{t('searchPin.analyzeHint')}</p>
      </div>

      {/* nearest pilot field */}
      {nearest && (
        <div className="flex flex-col gap-2 border-t border-glass-border pt-2">
          <p className="m-0 text-label text-fg-2">
            {rich('searchPin.nearest', {
              field: (
                <span className="font-semibold text-fg">
                  <Ltr>{nearest.field.field_id}</Ltr> · {nearest.field.name}
                </span>
              ),
              region: regionName(nearest.field.region_id),
              distance: <Ltr>{formatDistance(nearest.km)}</Ltr>,
            })}
          </p>
          {nearest.km > NEAR_KM && <p className="m-0 text-label text-fg-3">{t('searchPin.farAway')}</p>}
          <Button variant="secondary" icon={Navigation} onClick={() => onSelectField(nearest.field.field_id)} className="w-full">
            {t('searchPin.goTo', { id: nearest.field.field_id })}
          </Button>
        </div>
      )}
    </div>
  )
}
