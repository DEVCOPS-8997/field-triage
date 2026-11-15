/**
 * MapSearch: one search box for the field map.
 *
 * Suggests, as the user types:
 *  - Coordinates  : typed lat/lon in decimal or degrees-minutes-seconds (parsed locally)
 *  - Pilot fields : field id or name (local)
 *  - Regions      : pilot regions by name or alias (local); shown as quick picks when empty
 *  - Places       : addresses, towns, districts, states, countries (Photon geocoder, >= 3 chars)
 *
 * ARIA combobox pattern: input[role=combobox] + listbox, arrow keys, Enter, Escape.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Crosshair, Globe, LoaderCircle, MapPin, Search, Sprout, X } from 'lucide-react'
import type { FieldInfo } from '../types/api'
import { formatLatLon, parseCoordinates } from '../lib/geo/coords'
import { kindLabel, regionLine, searchPlaces, type Place } from '../lib/geo/geocode'
import { summarizeRegions, regionName, type RegionSummary } from '../lib/geo/regions'
import { cn } from './ui/cn'
import { hasKey, useI18n, type TranslationKey } from '../lib/i18n'

export type SearchPick =
  | { kind: 'coords'; lat: number; lon: number; swapped: boolean }
  | { kind: 'field'; field: FieldInfo }
  | { kind: 'region'; region: RegionSummary }
  | { kind: 'place'; place: Place }

type Option = SearchPick & { key: string; group: 'Coordinates' | 'Pilot fields' | 'Pilot regions' | 'Places' }

const GROUP_KEY: Record<Option['group'], TranslationKey> = {
  Coordinates: 'mapSearch.groupCoordinates',
  'Pilot fields': 'mapSearch.groupFields',
  'Pilot regions': 'mapSearch.groupRegions',
  Places: 'mapSearch.groupPlaces',
}

const NO_PLACES: Place[] = []
const MIN_REMOTE_CHARS = 3
const DEBOUNCE_MS = 350

interface Props {
  fields: FieldInfo[]
  onPick: (pick: SearchPick) => void
  className?: string
}

function optionText(o: Option): string {
  switch (o.kind) {
    case 'coords':
      return formatLatLon(o.lat, o.lon)
    case 'field':
      return `${o.field.field_id} · ${o.field.name}`
    case 'region':
      return o.region.name
    case 'place':
      return o.place.name
  }
}

export default function MapSearch({ fields, onPick, className }: Props) {
  const uid = useId()
  const { t } = useI18n()
  const listId = `${uid}-list`
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // Result of the last finished remote search, tagged with the query it answers.
  const [result, setResult] = useState<{ q: string; ok: boolean; places: Place[] }>({ q: '', ok: true, places: [] })

  const q = query.trim()
  const coords = useMemo(() => parseCoordinates(q), [q])
  const regions = useMemo(() => summarizeRegions(fields), [fields])
  const wantsRemote = !coords && q.length >= MIN_REMOTE_CHARS
  const fresh = wantsRemote && result.q === q
  const places = fresh ? result.places : NO_PLACES
  const remote: 'idle' | 'loading' | 'error' | 'done' = !wantsRemote
    ? 'idle'
    : !fresh
      ? 'loading'
      : result.ok
        ? 'done'
        : 'error'

  // Remote place search: debounced, abortable, only for text queries.
  useEffect(() => {
    if (!wantsRemote) return
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      searchPlaces(q, ctrl.signal)
        .then((res) => setResult({ q, ok: true, places: res }))
        .catch((err: unknown) => {
          if ((err as Error).name === 'AbortError') return
          setResult({ q, ok: false, places: [] })
        })
    }, DEBOUNCE_MS)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [q, wantsRemote])

  const options: Option[] = useMemo(() => {
    const needle = q.toLowerCase()
    const out: Option[] = []
    if (coords) out.push({ kind: 'coords', ...coords, key: 'coords', group: 'Coordinates' })

    if (needle && !coords) {
      fields
        .filter((f) =>
          [f.field_id, f.name, regionName(f.region_id), f.region_id].some((s) => s.toLowerCase().includes(needle)),
        )
        .slice(0, 4)
        .forEach((f) => out.push({ kind: 'field', field: f, key: `f-${f.field_id}`, group: 'Pilot fields' }))
    }

    if (!coords) {
      regions
        .filter(
          (r) =>
            !needle ||
            r.name.toLowerCase().includes(needle) ||
            r.region_id.toLowerCase() === needle ||
            r.aliases.some((a) => a.startsWith(needle) || needle.includes(a)),
        )
        .forEach((r) => out.push({ kind: 'region', region: r, key: `r-${r.region_id}`, group: 'Pilot regions' }))
    }

    places.forEach((p) => out.push({ kind: 'place', place: p, key: `p-${p.id}`, group: 'Places' }))
    return out
  }, [q, coords, fields, regions, places])

  // Highlighted option, kept in range as results change.
  const activeIdx = active < options.length ? active : -1

  const choose = (o: Option) => {
    setQuery(optionText(o))
    setOpen(false)
    setActive(-1)
    onPick(o)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive(options.length ? (activeIdx + 1) % options.length : -1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive(options.length ? (activeIdx <= 0 ? options.length - 1 : activeIdx - 1) : -1)
    } else if (e.key === 'Enter') {
      const o = options[activeIdx >= 0 ? activeIdx : 0]
      if (o && open) {
        e.preventDefault()
        choose(o)
      }
    } else if (e.key === 'Escape') {
      if (open) setOpen(false)
      else setQuery('')
    }
  }

  const clear = () => {
    setQuery('')
    setActive(-1)
    setOpen(true)
    inputRef.current?.focus()
  }

  // Status line under the options (polite live region).
  let status: ReactNode = null
  if (q && !coords && q.length < MIN_REMOTE_CHARS) status = t('mapSearch.minChars')
  else if (remote === 'loading') status = t('mapSearch.searching')
  else if (remote === 'error') status = t('mapSearch.error')
  else if (remote === 'done' && places.length === 0 && options.length === 0) status = t('mapSearch.noMatches')

  const showPanel = open && (options.length > 0 || status !== null)
  let lastGroup: Option['group'] | null = null

  return (
    <div data-component="MapSearch" className={cn('relative w-full', className)}>
      <div className="glass-strong flex min-h-11 items-center gap-2 rounded-full ps-4 pe-1 focus-within:outline-2 focus-within:outline-focus">
        <Search size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-fg-2" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={t('mapSearch.inputLabel')}
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={showPanel && activeIdx >= 0 ? `${uid}-opt-${activeIdx}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={t('mapSearch.placeholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-11 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-3"
        />
        {remote === 'loading' && (
          <LoaderCircle size={18} strokeWidth={1.75} aria-hidden className="fsa-spin shrink-0 text-fg-2" />
        )}
        {query && (
          <button
            type="button"
            aria-label={t('mapSearch.clear')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg-2 hover:bg-glass-flat hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="glass-strong absolute inset-x-0 top-[calc(100%+8px)] z-10 max-h-[min(360px,50dvh)] overflow-y-auto rounded-[var(--radius-control)] p-1">
          <ul id={listId} role="listbox" aria-label={t('mapSearch.suggestions')} className="m-0 list-none p-0">
            {options.map((o, i) => {
              const heading = o.group !== lastGroup ? o.group : null
              lastGroup = o.group
              return (
                <li key={o.key} role="presentation">
                  {heading && (
                    <p
                      role="presentation"
                      className="m-0 px-3 pb-1 pt-2 text-label font-semibold uppercase tracking-wide text-fg-3"
                    >
                      {t(GROUP_KEY[heading])}
                    </p>
                  )}
                  <div
                    id={`${uid}-opt-${i}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o)}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-[var(--radius-chip)] px-3 py-2',
                      i === activeIdx ? 'bg-accent/16' : 'hover:bg-glass-flat',
                    )}
                  >
                    <OptionBody o={o} />
                  </div>
                </li>
              )
            })}
          </ul>
          {status && (
            <p role="status" aria-live="polite" className="m-0 px-3 py-2 text-label text-fg-2">
              {status}
            </p>
          )}
          {places.length > 0 && (
            <p lang="en" className="m-0 px-3 pb-1 pt-1 text-end text-[0.75rem] text-fg-3">
              Place search © OpenStreetMap contributors · Photon
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function OptionBody({ o }: { o: Option }) {
  const { lang, t, tn } = useI18n()
  const kind = (k: string) =>
    lang === 'en' || !hasKey(`mapSearch.kind.${k}`) ? kindLabel(k) : t(`mapSearch.kind.${k}` as TranslationKey)
  const icon = { coords: Crosshair, field: Sprout, region: Globe, place: MapPin }[o.kind]
  const Icon = icon
  let title: string
  let sub: string
  let tag: string | null = null
  switch (o.kind) {
    case 'coords':
      title = formatLatLon(o.lat, o.lon)
      sub = o.swapped ? t('mapSearch.goToPointSwapped') : t('mapSearch.goToPoint')
      break
    case 'field':
      title = `${o.field.field_id} · ${o.field.name}`
      sub = regionName(o.field.region_id)
      tag = t('mapSearch.pilotTag')
      break
    case 'region':
      title = o.region.name
      sub = tn('mapSearch.pilotFieldCount', o.region.fields.length)
      break
    case 'place':
      title = o.place.name
      sub = regionLine(o.place) || o.place.country || ''
      tag = kind(o.place.kind)
      break
  }
  return (
    <>
      <Icon size={18} strokeWidth={1.75} aria-hidden className="mt-[3px] shrink-0 text-accent" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span dir={o.kind === 'coords' ? 'ltr' : undefined} className="truncate text-start text-body font-semibold text-fg">
          {title}
        </span>
        {sub && <span className="truncate text-label text-fg-2">{sub}</span>}
      </span>
      {tag && (
        <span className="mt-[3px] shrink-0 rounded-full border border-glass-border px-2 text-[0.75rem] leading-5 whitespace-nowrap text-fg-2">
          {tag}
        </span>
      )}
    </>
  )
}
