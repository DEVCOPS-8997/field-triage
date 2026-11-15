// Farmer inputs for the location analysis page, in the units the farmer thinks in,
// plus the pure mapping to the backend request (constraints, priorities, scenario).
import type { EquipmentId, FarmConstraints, Priorities, Scenario } from '../types/api'
import {
  DEFAULT_CANAL_CUSECS,
  DEFAULT_HOURS_PER_TURN,
  DEFAULT_PKR_PER_USD,
  DEFAULT_TUBEWELL_LPS,
  areaToM2,
  incomeToUsdPerHa,
  waterToMm,
  type AreaUnit,
  type Currency,
  type PerArea,
  type WaterUnit,
} from '../lib/units'

export type GoalKey = 'water' | 'soil' | 'income' | 'resilience'
export type BadSeasons = 'none' | '1' | '2' | '3' | 'any'

export const EQUIPMENT: { id: EquipmentId; label: string; hint: string }[] = [
  { id: 'seed_drill', label: 'Seed drill', hint: 'For sowing wheat, lentil or canola in lines' },
  { id: 'combine_harvester', label: 'Combine harvester (own or hired)', hint: 'For cutting wheat and rice by machine' },
  { id: 'rice_transplanting', label: 'Rice transplanting crew or machine', hint: 'For puddling and planting rice seedlings' },
  { id: 'picking_labour', label: 'Enough hands for picking', hint: 'Cotton, chilli and vegetables need many pickings' },
  { id: 'orchard_commitment', label: 'Land free for trees for 5+ years', hint: 'Orchards tie up the field for years' },
  { id: 'daily_market_access', label: 'Selling at a market every few days', hint: 'Vegetables and melons spoil quickly' },
]
const EQUIPMENT_IDS = new Set<string>(EQUIPMENT.map((e) => e.id))

export const GOALS: Record<GoalKey, string> = {
  water: 'Save water',
  soil: 'Build healthy soil',
  income: 'Earn more',
  resilience: 'Fewer bad seasons',
}
/** Weight for 1st, 2nd, 3rd and 4th place. Sums to 1.0 as the backend requires. */
export const RANK_WEIGHTS = [0.4, 0.3, 0.2, 0.1] as const

export const BAD_SEASONS: { v: BadSeasons; label: string; value: number | null }[] = [
  { v: 'none', label: 'None', value: 0 },
  { v: '1', label: '1 in 10 years', value: 1 },
  { v: '2', label: '2 in 10 years', value: 2 },
  { v: '3', label: '3 in 10 years', value: 3 },
  { v: 'any', label: "Doesn't matter", value: null },
]

export const RAIN_CHOICES: { v: number; label: string }[] = [
  { v: 0.6, label: 'Much less' },
  { v: 0.8, label: 'Less' },
  { v: 1.0, label: 'Normal' },
  { v: 1.2, label: 'More' },
  { v: 1.4, label: 'Much more' },
]

export const WARMING_CHOICES: { v: number; label: string }[] = [
  { v: 0, label: 'Same as now' },
  { v: 1, label: 'A little hotter' },
  { v: 2, label: 'Hotter' },
  { v: 3, label: 'Much hotter' },
  { v: 4, label: 'Extreme heat' },
]

export interface FarmInputs {
  water: {
    known: boolean
    amount: number | null
    unit: WaterUnit
    tubewellLps: number | null
    hoursPerTurn: number | null
    canalCusecs: number | null
  }
  area: { value: number | null; unit: AreaUnit }
  income: { amount: number | null; currency: Currency; per: PerArea; pkrPerUsd: number | null }
  badSeasons: BadSeasons
  noEquipment: EquipmentId[]
  goals: GoalKey[] // most important first
  rainMultiplier: number
  warmingC: number
}

export const DEFAULT_INPUTS: FarmInputs = {
  water: {
    known: false,
    amount: null,
    unit: 'acre_inch',
    tubewellLps: DEFAULT_TUBEWELL_LPS,
    hoursPerTurn: DEFAULT_HOURS_PER_TURN,
    canalCusecs: DEFAULT_CANAL_CUSECS,
  },
  area: { value: null, unit: 'acre' },
  income: { amount: null, currency: 'PKR', per: 'acre', pkrPerUsd: DEFAULT_PKR_PER_USD },
  badSeasons: 'any',
  noEquipment: [],
  goals: ['water', 'soil', 'income', 'resilience'],
  rainMultiplier: 1,
  warmingC: 0,
}

/** Field area in m²: the saved field's area wins over the typed one. */
export function fieldAreaM2(inputs: FarmInputs, urlAreaHa: number | null): number | null {
  if (urlAreaHa !== null && urlAreaHa > 0) return urlAreaHa * 10_000
  const a = inputs.area.value
  return a !== null && a > 0 ? areaToM2(a, inputs.area.unit) : null
}

export function waterMm(inputs: FarmInputs, urlAreaHa: number | null): number | null {
  const w = inputs.water
  if (!w.known) return null
  return waterToMm(w.amount, w.unit, fieldAreaM2(inputs, urlAreaHa), {
    tubewellLps: w.tubewellLps,
    hoursPerTurn: w.hoursPerTurn,
    canalCusecs: w.canalCusecs,
  })
}

export function incomeUsdHa(inputs: FarmInputs): number | null {
  const i = inputs.income
  return incomeToUsdPerHa(i.amount, i.currency, i.per, i.pkrPerUsd)
}

export function toPriorities(goals: GoalKey[]): Priorities {
  const w = (k: GoalKey) => RANK_WEIGHTS[goals.indexOf(k)] ?? 0
  return { w_water: w('water'), w_soil: w('soil'), w_income: w('income'), w_resilience: w('resilience') }
}

export function toScenario(inputs: FarmInputs): Scenario {
  return { rain_multiplier: inputs.rainMultiplier, temp_delta_c: inputs.warmingC }
}

const round = (v: number | null, digits = 0) => (v === null ? null : Number(v.toFixed(digits)))

/** Constraints in backend units. Values the farmer did not give stay null, never 0. */
export function toConstraints(inputs: FarmInputs, urlAreaHa: number | null): FarmConstraints {
  const mm = waterMm(inputs, urlAreaHa)
  return {
    water_available_mm: mm === null ? null : Math.min(3000, round(mm) as number),
    min_income_usd_ha: round(incomeUsdHa(inputs)),
    max_bad_seasons_in_10: BAD_SEASONS.find((b) => b.v === inputs.badSeasons)?.value ?? null,
    unavailable_equipment: [...inputs.noEquipment].sort(),
  }
}

// ------------------------------------------------------------------ persistence
const STORAGE_KEY = 'fieldshift.farmInputs.v1'

const isNumOrNull = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v))
const oneOf = <T extends string>(v: unknown, xs: readonly T[], d: T): T => (xs.includes(v as T) ? (v as T) : d)

/** Validate anything read back from storage; unknown or broken fields fall back to defaults. */
export function sanitizeInputs(raw: unknown): FarmInputs {
  const d = DEFAULT_INPUTS
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Record<string, Record<string, unknown> | unknown>
  const w = (r.water ?? {}) as Record<string, unknown>
  const a = (r.area ?? {}) as Record<string, unknown>
  const i = (r.income ?? {}) as Record<string, unknown>
  const goals = Array.isArray(r.goals) ? (r.goals as unknown[]).filter((g): g is GoalKey => typeof g === 'string' && g in GOALS) : []
  const fullGoals = goals.length === 4 && new Set(goals).size === 4 ? goals : d.goals
  const equip = Array.isArray(r.noEquipment)
    ? (r.noEquipment as unknown[]).filter((e): e is EquipmentId => typeof e === 'string' && EQUIPMENT_IDS.has(e))
    : []
  const rain = typeof r.rainMultiplier === 'number' ? r.rainMultiplier : 1
  const warm = typeof r.warmingC === 'number' ? r.warmingC : 0
  return {
    water: {
      known: w.known === true,
      amount: isNumOrNull(w.amount) ? w.amount : null,
      unit: oneOf(w.unit, ['mm', 'inch', 'acre_inch', 'acre_foot', 'm3', 'tubewell_hours', 'canal_turns'] as const, d.water.unit),
      tubewellLps: isNumOrNull(w.tubewellLps) ? w.tubewellLps : d.water.tubewellLps,
      hoursPerTurn: isNumOrNull(w.hoursPerTurn) ? w.hoursPerTurn : d.water.hoursPerTurn,
      canalCusecs: isNumOrNull(w.canalCusecs) ? w.canalCusecs : d.water.canalCusecs,
    },
    area: {
      value: isNumOrNull(a.value) ? a.value : null,
      unit: oneOf(a.unit, ['acre', 'hectare', 'kanal'] as const, d.area.unit),
    },
    income: {
      amount: isNumOrNull(i.amount) ? i.amount : null,
      currency: oneOf(i.currency, ['PKR', 'USD'] as const, d.income.currency),
      per: oneOf(i.per, ['acre', 'hectare'] as const, d.income.per),
      pkrPerUsd: isNumOrNull(i.pkrPerUsd) ? i.pkrPerUsd : d.income.pkrPerUsd,
    },
    badSeasons: oneOf(r.badSeasons, ['none', '1', '2', '3', 'any'] as const, d.badSeasons),
    noEquipment: [...new Set(equip)],
    goals: fullGoals,
    rainMultiplier: RAIN_CHOICES.some((c) => c.v === rain) ? rain : 1,
    warmingC: WARMING_CHOICES.some((c) => c.v === warm) ? warm : 0,
  }
}

export function loadInputs(): FarmInputs {
  try {
    const s = window.localStorage.getItem(STORAGE_KEY)
    return s ? sanitizeInputs(JSON.parse(s)) : DEFAULT_INPUTS
  } catch {
    return DEFAULT_INPUTS
  }
}

export function saveInputs(inputs: FarmInputs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs))
  } catch {
    /* private window or storage blocked: inputs still work for this visit */
  }
}

/** `equip=seed_drill,combine_harvester` from My Fields → equipment the farmer does NOT have. */
export function parseEquipParam(v: string | null): EquipmentId[] | null {
  if (v === null) return null
  return [...new Set(v.split(',').map((s) => s.trim()).filter((s): s is EquipmentId => EQUIPMENT_IDS.has(s)))]
}
