import type { CompareResponse, EquipmentId, FarmConstraints, Priorities, RotationScore, Scenario } from '../types/api'

// Mock-mode re-scoring (CMP-02). The static mock compare JSON ignores the
// request, so the client recomputes the overall score from the component
// scores with the user's weights, and applies a SIMULATED scenario nudge.
// This is a demo stand-in for the backend scoring, not a forecast.

type ComponentKey = 'water' | 'soil' | 'income' | 'resilience'

const WEIGHT_KEYS: Record<ComponentKey, keyof Priorities> = {
  water: 'w_water',
  soil: 'w_soil',
  income: 'w_income',
  resilience: 'w_resilience',
}

const COMPONENTS = Object.keys(WEIGHT_KEYS) as ComponentKey[]

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v))
const round1 = (v: number) => Math.round(v * 10) / 10
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Weights normalised to sum to 1; equal weights if the input is unusable. */
export function normaliseWeights(p: Priorities): Record<ComponentKey, number> {
  const raw = COMPONENTS.map((k) => {
    const w = p[WEIGHT_KEYS[k]]
    return isNum(w) && w > 0 ? w : 0
  })
  const sum = raw.reduce((a, b) => a + b, 0)
  const out = {} as Record<ComponentKey, number>
  COMPONENTS.forEach((k, i) => {
    out[k] = sum > 0 ? raw[i] / sum : 1 / COMPONENTS.length
  })
  return out
}

/** Simulated water multiplier: drier hurts a lot, wetter helps a little. */
export function waterFactor(rainMultiplier: number): number {
  if (!isNum(rainMultiplier) || rainMultiplier === 1) return 1
  return rainMultiplier < 1 ? 0.4 + 0.6 * rainMultiplier : 1 + 0.25 * (rainMultiplier - 1)
}

function applyScenario(scores: Record<string, number>, scenario: Scenario): Record<string, number> {
  const next: Record<string, number> = { ...scores }
  const rain = isNum(scenario.rain_multiplier) ? scenario.rain_multiplier : 1
  const temp = isNum(scenario.temp_delta_c) ? scenario.temp_delta_c : 0
  // Nulls / missing values stay as they are: never turned into zeros.
  if (isNum(next.water) && rain !== 1) next.water = round1(clamp(next.water * waterFactor(rain)))
  if (isNum(next.resilience) && temp !== 0) next.resilience = round1(clamp(next.resilience - 4 * temp))
  return next
}

function weightedOverall(
  scores: Record<string, number>,
  weights: Record<ComponentKey, number>,
): number | null {
  let total = 0
  let wSum = 0
  for (const k of COMPONENTS) {
    const v = scores[k]
    if (!isNum(v)) continue // missing component: re-normalise over what we have
    total += weights[k] * v
    wSum += weights[k]
  }
  if (wSum <= 0) return null
  return round1(clamp(total / wSum))
}

export function rescoreMock(
  resp: CompareResponse,
  priorities: Priorities,
  scenario: Scenario,
): CompareResponse {
  const weights = normaliseWeights(priorities)

  const rescored: RotationScore[] = resp.rotations.map((r) => {
    const scores = applyScenario(r.scores ?? {}, scenario)
    const overall = weightedOverall(scores, weights)
    if (overall === null || !isNum(r.overall)) return { ...r, scores }
    const delta = overall - r.overall
    return {
      ...r,
      scores,
      overall,
      overall_low: isNum(r.overall_low) ? round1(clamp(r.overall_low + delta)) : r.overall_low,
      overall_high: isNum(r.overall_high) ? round1(clamp(r.overall_high + delta)) : r.overall_high,
    }
  })

  // Re-rank: higher overall first; ties keep the original rank order.
  const order = [...rescored].sort(
    (a, b) => (isNum(b.overall) ? b.overall : -1) - (isNum(a.overall) ? a.overall : -1) || a.rank - b.rank,
  )
  const rankById = new Map(order.map((r, i) => [r.rotation_id, i + 1]))

  return {
    ...resp,
    scenario_applied: scenario.rain_multiplier !== 1 || scenario.temp_delta_c !== 0,
    rotations: order.map((r) => ({ ...r, rank: rankById.get(r.rotation_id) ?? r.rank })),
  }
}

// ---- Mock farm limits (demo stand-in for the backend shortlist, not the real rules) ----

const EQUIPMENT_BY_CROP: Record<string, EquipmentId[]> = {
  wheat: ['seed_drill', 'combine_harvester'],
  rice: ['rice_transplanting', 'combine_harvester'],
  cotton: ['picking_labour'],
  chilli: ['picking_labour'],
  vegetable: ['daily_market_access', 'picking_labour'],
  melon: ['daily_market_access'],
  mango: ['orchard_commitment'],
  citrus: ['orchard_commitment'],
}

const EQUIPMENT_WORDS: Record<EquipmentId, string> = {
  seed_drill: 'a seed drill',
  combine_harvester: 'a combine harvester',
  rice_transplanting: 'a rice transplanting crew',
  picking_labour: 'enough hands for picking',
  orchard_commitment: 'land free for trees for 5+ years',
  daily_market_access: 'a market every few days',
}

const STRATEGY_REASON: Record<string, string> = {
  water_saving: 'Best water-saving option',
  soil_building: 'Best soil-building option',
  income: 'Best income option',
  resilience: 'Best option for steady harvests',
  diversified: 'Best mixed option',
}

function mockFailures(r: RotationScore, c: FarmConstraints): string[] {
  const out: string[] = []
  const gap = r.mean_irrigation_gap_mm
  // gap is a YEARLY total over both crop seasons; the farmer's water is PER SEASON (demo: 2 seasons a year).
  if (isNum(c.water_available_mm) && isNum(gap) && gap > c.water_available_mm * 2) {
    out.push(
      `Needs about ${Math.round(gap)} mm of watering a year; you can give about ${Math.round(c.water_available_mm * 2)} mm a year (${Math.round(c.water_available_mm)} mm per season).`,
    )
  }
  if (isNum(c.min_income_usd_ha) && isNum(r.annual_value_usd_ha) && r.annual_value_usd_ha < c.min_income_usd_ha) {
    out.push(
      `Expected sales of about $${Math.round(r.annual_value_usd_ha)} per hectare are below the $${Math.round(c.min_income_usd_ha)} you need.`,
    )
  }
  if (isNum(c.max_bad_seasons_in_10) && isNum(r.scores?.resilience)) {
    const bad = Math.round((100 - r.scores.resilience) / 10)
    if (bad > c.max_bad_seasons_in_10) out.push(`About ${bad} bad seasons in 10 in the past; you can accept ${c.max_bad_seasons_in_10}.`)
  }
  const missing = c.unavailable_equipment ?? []
  if (missing.length) {
    const label = r.label.toLowerCase()
    const needs = new Set<EquipmentId>()
    for (const [crop, eq] of Object.entries(EQUIPMENT_BY_CROP)) if (label.includes(crop)) eq.forEach((e) => needs.add(e))
    for (const e of missing) if (needs.has(e)) out.push(`Needs ${EQUIPMENT_WORDS[e]}, which you said you do not have.`)
  }
  return out
}

/** Mark rotations that break the farmer's limits and rebuild the shortlist (current + best fitting per strategy). */
export function applyMockConstraints<T extends CompareResponse>(resp: T, constraints: FarmConstraints | undefined): T {
  const c = constraints ?? {}
  const checked = resp.rotations.map((r) => {
    const failures = mockFailures(r, c)
    return { ...r, fits_constraints: failures.length === 0, constraint_failures: failures }
  })
  const bestByStrategy = new Map<string, string>()
  for (const r of [...checked].sort((a, b) => a.rank - b.rank)) {
    if (r.is_existing || !r.fits_constraints) continue
    if (!bestByStrategy.has(r.strategy_type)) bestByStrategy.set(r.strategy_type, r.rotation_id)
  }
  const rotations = checked.map((r) => {
    const best = bestByStrategy.get(r.strategy_type) === r.rotation_id
    return {
      ...r,
      shortlisted: r.is_existing || best,
      shortlist_reason: r.is_existing
        ? 'Your current rotation'
        : best
          ? (STRATEGY_REASON[r.strategy_type] ?? 'Best of its kind')
          : null,
    }
  })
  return {
    ...resp,
    rotations,
    total_candidates: resp.total_candidates ?? rotations.length,
    constraints_applied: c,
  }
}
