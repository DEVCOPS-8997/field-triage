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
  heavy_rain_days_ge_25mm?: number | null // days with rain >= 25 mm in the month
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

/** Equipment / labour / commitments the farmer does NOT have (backend FarmConstraints). */
export type EquipmentId =
  | 'seed_drill'
  | 'combine_harvester'
  | 'rice_transplanting'
  | 'picking_labour'
  | 'orchard_commitment'
  | 'daily_market_access'

/** Farmer limits in real units. The client converts units before sending; null = not given. */
export interface FarmConstraints {
  water_available_mm?: number | null // irrigation per crop season, depth over the field (mm)
  min_income_usd_ha?: number | null // minimum gross value per ha per year (USD)
  max_bad_seasons_in_10?: number | null // risk tolerance 0..10
  unavailable_equipment?: EquipmentId[]
}

/** One calendar month of a rotation's typical year ("Your farm's year"). */
export interface FarmMonth {
  month: number // 1..12
  crops: string[]
  cover_crop: boolean
  bare: boolean
  stage?: 'sowing' | 'growing' | 'flowering' | 'harvest' | null
  heat_risk?: number | null // 0..1 share of past years
  frost_risk?: number | null
  dry_risk?: number | null
  heavy_rain_risk?: number | null
  erosion_alert: boolean
  ndvi?: number | null // observed MODIS greenness (site-level)
  opportunity: boolean
}

export interface NdviStatus {
  state: 'ready' | 'running' | 'failed' | 'not_configured' | 'disabled' | 'not_started'
  provider?: string | null
  message: string
  pixel_key: string
  attempts?: string[]
  elapsed_s?: number
  merged?: boolean
  summary?: {
    ndvi_monthly_mean: (number | null)[]
    bare_days_est_mean?: number | null
    ndvi_latest?: number | null
    ndvi_latest_date?: string | null
    period_start?: string | null
    period_end?: string | null
    n_composites_good: number
    provider: string
  } | null
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
  // Deterministic shortlist: current rotation + best option of each strategy type that fits.
  shortlisted?: boolean
  shortlist_reason?: string | null
  fits_constraints?: boolean
  constraint_failures?: string[]
  farm_year?: FarmMonth[] // 12 entries, Jan..Dec
  key_moments?: string[]
  mean_water_need_mm?: number | null
  mean_irrigation_gap_mm?: number | null
}

export interface CompareResponse {
  field_id: string
  scenario_applied: boolean
  rotations: RotationScore[] // always >= 3, includes the existing rotation
  data_mode: DataMode
  data_quality: Record<string, Quality>
  disclaimer: string
  income_status?: IncomeStatus | null
  total_candidates?: number | null
  constraints_applied?: FarmConstraints | null
}

// ---- Dynamic GPS-location analysis (POST /api/v1/locations/compare) ----
export interface LocationCompareRequest {
  location: Location
  irrigation: 'none' | 'limited' | 'reliable'
  current_rotation_id?: string | null
  current_crop?: string | null
  priorities?: Priorities
  scenario?: Scenario
  constraints?: FarmConstraints
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
    ndvi?: NdviStatus
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
