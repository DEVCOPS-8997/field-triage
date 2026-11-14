import type {
  CompareRequest,
  CompareResponse,
  FieldInfo,
  FieldProfile,
  LocationCompareRequest,
  LocationCompareResponse,
  LocationRegionResponse,
  RotationDef,
} from '../types/api'
import { rescoreMock } from '../lib/mockScoring'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = typeof body?.detail === 'string' ? body.detail : JSON.stringify(body?.detail ?? '')
    } catch { /* non-JSON error body */ }
    throw new Error(`${res.status} ${detail || res.statusText}`)
  }
  return res.json() as Promise<T>
}

// Mock mode reads copies of data/demo from public/mock/ (no backend needed).
export const api = {
  fields: () =>
    USE_MOCK
      ? getJson<FieldInfo[]>('/mock/fields.json')
      : getJson<FieldInfo[]>(`${API_URL}/api/v1/fields`),

  profile: (fieldId: string) =>
    USE_MOCK
      ? getJson<FieldProfile>(`/mock/profiles/${fieldId}.json`)
      : getJson<FieldProfile>(`${API_URL}/api/v1/fields/${fieldId}/profile`),

  compare: (req: CompareRequest) =>
    USE_MOCK
      ? getJson<CompareResponse>(`/mock/compare/${req.field_id}.json`).then((resp) =>
          rescoreMock(resp, req.priorities, req.scenario),
        )
      :getJson<CompareResponse>(`${API_URL}/api/v1/rotations/compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
        }),

  rotations: () => getJson<RotationDef[]>(`${API_URL}/api/v1/rotations`),

  // Region + rotations valid for a GPS point (422 with a readable message if unsupported).
  locationRegion: (lat: number, lon: number) => {
    if (USE_MOCK) {
      return Promise.reject(new Error('Location analysis needs the backend. Set VITE_USE_MOCK=false and start the API.'))
    }
    return getJson<LocationRegionResponse>(`${API_URL}/api/v1/locations/region?lat=${lat}&lon=${lon}`)
  },

  // Live GPS analysis always needs the backend (no mock equivalent).
  compareLocation: (req: LocationCompareRequest) => {
    if (USE_MOCK) {
      return Promise.reject(new Error('Location analysis needs the backend. Set VITE_USE_MOCK=false and start the API.'))
    }
    return getJson<LocationCompareResponse>(`${API_URL}/api/v1/locations/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  },
}
