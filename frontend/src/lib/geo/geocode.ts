/**
 * Place search for the field map, via Photon (photon.komoot.io): a keyless, CORS-enabled
 * geocoder built on OpenStreetMap data and designed for search-as-you-type.
 *
 * Privacy: only what the user typed (or coordinates they typed) is sent. The device position
 * from "Use my device location" is never passed here.
 * Fair use: callers debounce, require >= 3 characters, abort stale requests; results are cached
 * in memory for the session.
 */

const PHOTON = 'https://photon.komoot.io'

export interface Place {
  id: string
  name: string
  lat: number
  lon: number
  /** [west, south, east, north] when the place has an extent */
  bbox?: [number, number, number, number]
  /** OSM place type, e.g. city, county, state, country, street, house */
  kind: string
  street?: string
  housenumber?: string
  postcode?: string
  city?: string
  district?: string
  county?: string
  state?: string
  country?: string
  countrycode?: string
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    osm_type?: string
    osm_id?: number
    osm_value?: string
    type?: string
    name?: string
    street?: string
    housenumber?: string
    postcode?: string
    city?: string
    district?: string
    locality?: string
    county?: string
    state?: string
    country?: string
    countrycode?: string
    extent?: [number, number, number, number] // [minLon, maxLat, maxLon, minLat]
  }
}

function toPlace(f: PhotonFeature): Place {
  const p = f.properties
  const [lon, lat] = f.geometry.coordinates
  const name =
    p.name ??
    ([p.housenumber, p.street].filter(Boolean).join(' ') || p.city || p.county || p.state || p.country || 'Unnamed place')
  return {
    id: `${p.osm_type ?? 'X'}${p.osm_id ?? `${lat},${lon}`}`,
    name,
    lat,
    lon,
    bbox: p.extent ? [p.extent[0], p.extent[3], p.extent[2], p.extent[1]] : undefined,
    kind: p.type ?? p.osm_value ?? 'place',
    street: p.street,
    housenumber: p.housenumber,
    postcode: p.postcode,
    city: p.city ?? p.locality,
    district: p.district,
    county: p.county,
    state: p.state,
    country: p.country,
    countrycode: p.countrycode,
  }
}

const cache = new Map<string, Place[]>()

async function getJson(url: string, signal?: AbortSignal): Promise<{ features?: PhotonFeature[] }> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`)
  return res.json()
}

export async function searchPlaces(query: string, signal?: AbortSignal, limit = 6): Promise<Place[]> {
  const q = query.trim()
  const key = `s:${q.toLowerCase()}:${limit}`
  const hit = cache.get(key)
  if (hit) return hit
  const url = `${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=en`
  const data = await getJson(url, signal)
  const places = (data.features ?? []).map(toPlace)
  // Photon can return the same OSM object twice (node + relation); keep first per name+admin.
  const seen = new Set<string>()
  const unique = places.filter((p) => {
    const k = [p.name, p.city, p.state, p.country].join('|')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  cache.set(key, unique)
  return unique
}

export async function reversePlace(lat: number, lon: number, signal?: AbortSignal): Promise<Place | null> {
  const key = `r:${lat.toFixed(4)},${lon.toFixed(4)}`
  const hit = cache.get(key)
  if (hit) return hit[0] ?? null
  const url = `${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=en`
  const data = await getJson(url, signal)
  const places = (data.features ?? []).map(toPlace)
  cache.set(key, places)
  return places[0] ?? null
}

/** "Huxley, Story, Iowa, United States": admin chain without repeats. */
export function regionLine(p: Place, includeLocal = true): string {
  const parts = [includeLocal ? (p.city ?? p.district) : undefined, p.county, p.state, p.country]
  const out: string[] = []
  for (const x of parts) if (x && x !== p.name && !out.includes(x)) out.push(x)
  return out.join(', ')
}

/** "12 Main Street" style first line when the place is an address. */
export function streetLine(p: Place): string | undefined {
  if (!p.street) return undefined
  return [p.housenumber, p.street].filter(Boolean).join(' ')
}

/** Suggested zoom when a place has no extent. */
export function zoomForKind(kind: string): number {
  switch (kind) {
    case 'house':
    case 'building':
      return 17
    case 'street':
      return 16
    case 'locality':
    case 'district':
    case 'village':
    case 'hamlet':
      return 14
    case 'city':
    case 'town':
      return 12
    case 'county':
      return 9
    case 'state':
      return 6
    case 'country':
      return 5
    default:
      return 13
  }
}

const KIND_LABEL: Record<string, string> = {
  house: 'Address',
  building: 'Building',
  street: 'Street',
  locality: 'Locality',
  district: 'District',
  city: 'City',
  town: 'Town',
  village: 'Village',
  county: 'County / district',
  state: 'State / province',
  country: 'Country',
}

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? 'Place'
}
