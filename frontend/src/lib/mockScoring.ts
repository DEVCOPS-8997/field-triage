import type { CompareResponse, Priorities, RotationScore, Scenario } from '../types/api'

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
