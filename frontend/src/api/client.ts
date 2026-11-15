import type {
  CompareRequest,
  CompareResponse,
  FieldInfo,
  FieldProfile,
  LocationCompareRequest,
  LocationCompareResponse,
  LocationRegionResponse,
  NdviStatus,
  RotationDef,
} from '../types/api'
import { applyMockConstraints, rescoreMock } from '../lib/mockScoring'

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

// ---- Mock-mode stand-ins for the live location endpoints (demo field F01, offline) ----
const MOCK_FIELD = 'F01'
const MOCK_REGION = { region_id: 'R1', region_name: 'Punjab (demo data)' }

async function mockRegion(): Promise<LocationRegionResponse> {
  const cmp = await getJson<CompareResponse>(`/mock/compare/${MOCK_FIELD}.json`)
  return {
    ...MOCK_REGION,
    rotations: cmp.rotations.map((r) => ({
      rotation_id: r.rotation_id,
      label: r.label.replace(/\s*\(current\)\s*$/i, ''),
      region_id: MOCK_REGION.region_id,
      strategy_type: r.strategy_type,
      sequence: [],
    })),
  }
}

function mockNdvi(profile: FieldProfile | null): NdviStatus {
  const monthly = profile?.climatology?.ndvi_monthly_mean
  return {
    state: 'ready',
    provider: 'demo',
    message: 'Demo greenness from the sample field.',
    pixel_key: 'demo',
    summary: Array.isArray(monthly)
      ? { ndvi_monthly_mean: monthly, n_composites_good: 0, provider: 'demo' }
      : null,
  }
}

async function mockCompareLocation(req: LocationCompareRequest): Promise<LocationCompareResponse> {
  const [cmp, profile] = await Promise.all([
    getJson<CompareResponse>(`/mock/compare/${MOCK_FIELD}.json`),
    getJson<FieldProfile>(`/mock/profiles/${MOCK_FIELD}.json`),
  ])
  const currentId = req.current_rotation_id ?? cmp.rotations.find((r) => r.is_existing)?.rotation_id
  const withCurrent = {
    ...cmp,
    rotations: cmp.rotations.map((r) => ({
      ...r,
      label: r.label.replace(/\s*\(current\)\s*$/i, ''),
      is_existing: r.rotation_id === currentId,
    })),
  }
  const scored = rescoreMock(
    withCurrent,
    req.priorities ?? { w_water: 0.25, w_soil: 0.25, w_income: 0.25, w_resilience: 0.25 },
    req.scenario ?? { rain_multiplier: 1, temp_delta_c: 0 },
  )
  const constrained = applyMockConstraints(scored, req.constraints)
  return {
    ...constrained,
    location: {
      lat: req.location.lat,
      lon: req.location.lon,
      ...MOCK_REGION,
      current_rotation_id: currentId ?? '',
      nasa_grid_cell: {},
      data_resolution_note: 'Demo data from a sample Punjab field, not this exact point.',
      soil_texture_class: 'sandy clay loam',
    },
    analysis_type: 'demo',
    warnings: ['Demo mode: results come from a sample field, not live NASA data for this point.'],
    data_retrieval: {
      source: 'cache',
      fetched_at: new Date().toISOString(),
      period_start: profile.period_start,
      period_end: profile.period_end,
      stale: false,
      ndvi: mockNdvi(profile),
    },
    profile,
    now_status: 'WATCH',
    now_reasons: [],
  }
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
    if (USE_MOCK) return mockRegion()
    return getJson<LocationRegionResponse>(`${API_URL}/api/v1/locations/region?lat=${lat}&lon=${lon}`)
  },

  // Live GPS analysis. Mock mode answers with the demo field F01 so the UI can be shown offline.
  compareLocation: (req: LocationCompareRequest) => {
    if (USE_MOCK) return mockCompareLocation(req)
    return getJson<LocationCompareResponse>(`${API_URL}/api/v1/locations/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  },

  // Satellite greenness (MODIS NDVI) download status for a point. start=false only reads the status.
  locationNdvi: (lat: number, lon: number, start = false) => {
    if (USE_MOCK) return getJson<FieldProfile>(`/mock/profiles/${MOCK_FIELD}.json`).then(mockNdvi)
    return getJson<NdviStatus>(`${API_URL}/api/v1/locations/ndvi?lat=${lat}&lon=${lon}&start=${start}`)
  },
}
