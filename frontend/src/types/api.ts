// Mirrors backend/app/models/schemas.py (FROZEN contract, plan section 6).
// Keep snake_case so JSON maps 1:1. Do not rename without telling the team.

export type Quality = 'observed' | 'derived' | 'unavailable' | 'demo'
export type DataMode = 'observed' | 'demo'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface Location {
  lat: number
  lon: number
}

export interface FieldInfo {
  field_id: string
  name: string
  region_id: string
  location: Location
  soil_type?: string | null
  irrigation: 'none' | 'limited' | 'reliable'
  market_access?: number | null
  current_rotation_id: string
  geometry: Record<string, unknown> // GeoJSON Polygon
}

export interface MonthRecord {
  year: number
  month: number
  rain_mm?: number | null
  tmean_c?: number | null
  tmax_mean_c?: number | null
  tmin_mean_c?: number | null
  heat_days_ge: Record<string, number>
  frost_days_le_0c?: number | null
  dry_days_lt_1mm?: number | null
  smap_rootzone_m3m3?: number | null
  ndvi_mean?: number | null
  eto_mm?: number | null // FAO-56 reference ET, monthly total (live POWER)
}

export interface FieldProfile {
  field_id: string
  period_start: string
  period_end: string
  n_years: number
  monthly: MonthRecord[]
  climatology: Record<string, number | number[] | null>
  soil: Record<string, number | null>
  terrain: Record<string, number | null>
  now: Record<string, number | string | Record<string, unknown> | null>
  data_mode: DataMode
  data_sources: Record<string, string>
  data_quality: Record<string, Quality>
}

export interface Priorities {
  w_water: number
  w_soil: number
  w_income: number
  w_resilience: number
}

export interface Scenario {
  rain_multiplier: number // 0.6 to 1.4
  temp_delta_c: number // 0 to 4
}

export interface CompareRequest {
  field_id: string
  priorities: Priorities
  scenario: Scenario
  rotation_ids?: string[] | null
}

export interface EvidenceItem {
  variable: string
  value?: number | string | null
  unit: string
  source: string
  interpretation: string
  label?: string | null
  group?: EvidenceGroup | null
  source_url?: string | null
}

export type EvidenceGroup = 'climate' | 'water' | 'soil' | 'terrain' | 'crop' | 'market' | 'farm'
export type InsightKind = 'benefit' | 'risk' | 'gap' | 'check'

/** One plain-language finding with the authority behind it. */
export interface Insight {
  kind: InsightKind
  topic: string
  title: string
  detail: string
  source?: string | null
  source_url?: string | null
}

export interface IncomeStatus {
  scored: boolean
  note: string
  missing: string[]
  source: string
  source_url?: string | null
  retrieved_at?: string | null
}

export interface RotationScore {
  rotation_id: string
  label: string
  strategy_type: string
  is_existing: boolean
  scores: Record<string, number> // water, soil, resilience always; income only when FAOSTAT data exists for every option
  overall: number
  overall_low: number
  overall_high: number
  rank: number
  confidence: Confidence
  why: string[]
  benefits: string[]
  risks: string[]
  data_gaps: string[]
  needs_local_review: string[]
  evidence: EvidenceItem[]
  insights?: Insight[]
  annual_value_usd_ha?: number | null
}

export interface CompareResponse {
  field_id: string
  scenario_applied: boolean
  rotations: RotationScore[] // always >= 3, includes the existing rotation
  data_mode: DataMode
  data_quality: Record<string, Quality>
  disclaimer: string
  income_status?: IncomeStatus | null
}

// ---- Dynamic GPS-location analysis (POST /api/v1/locations/compare) ----
export interface LocationCompareRequest {
  location: Location
  irrigation: 'none' | 'limited' | 'reliable'
  current_rotation_id?: string | null
  current_crop?: string | null
  priorities?: Priorities
  scenario?: Scenario
}

export interface LocationInfo {
  lat: number
  lon: number
  region_id: string
  region_name: string
  current_rotation_id: string
  nasa_grid_cell: Record<string, number>
  data_resolution_note: string
  soil_texture_class?: string | null // USDA class derived from SoilGrids sand/clay
}

export type NowStatusValue = 'FAVORABLE' | 'WATCH' | 'STRESSED'

export interface GeoProvider {
  status: 'available' | 'unavailable'
  provider: string
  product?: string
  spatial_resolution?: string
  quality?: string
  sample_note?: string
  reason?: string
  local_relief_m?: number
  retrieved_at?: string
}

export interface LocationCompareResponse extends CompareResponse {
  location: LocationInfo
  analysis_type: string
  warnings: string[]
  data_retrieval: {
    source: string
    fetched_at: string
    period_start: string
    period_end: string
    stale: boolean
    power_parameters?: string[]
    geospatial?: { soil?: GeoProvider; terrain?: GeoProvider }
  }
  profile: FieldProfile // live profile: monthly climate, climatology, soil, terrain, now
  now_status: NowStatusValue
  now_reasons: string[]
}

export interface LocationRegionResponse {
  region_id: string
  region_name: string
  rotations: RotationDef[]
}

export interface RotationDef {
  rotation_id: string
  label: string
  region_id: string
  strategy_type: string
  sequence: string[]
}
