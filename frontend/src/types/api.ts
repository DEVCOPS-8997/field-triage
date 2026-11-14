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
}

export interface RotationScore {
  rotation_id: string
  label: string
  strategy_type: string
  is_existing: boolean
  scores: Record<string, number> // water, soil, resilience, income (0 to 100)
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
}

export interface CompareResponse {
  field_id: string
  scenario_applied: boolean
  rotations: RotationScore[] // always >= 3, includes the existing rotation
  data_mode: DataMode
  data_quality: Record<string, Quality>
  disclaimer: string
}
