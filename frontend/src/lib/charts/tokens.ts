// Chart colour tokens from 02-UI-SPEC "Chart colour tokens". Recharts draws SVG
// presentation attributes, where CSS variables are not reliable, so the hex values
// are mirrored here in ONE map. Keep in sync with src/index.css @theme.
import type { RotationScore } from '../../types/api'

export const CHART_COLORS = {
  water: '#38bdf8',
  soil: '#e9965f',
  resilience: '#2dd4bf',
  income: '#bef264',
  ndvi: '#a3e635',
  moisture: '#67e8f9',
  bare: '#e9965f',
  existing: '#e7f5ec',
  seriesExtra: '#f0abfc',
  fg: '#ecfdf3',
  fg2: '#b4cfc0',
  fg3: '#9bbba8',
  grid: 'rgba(255,255,255,0.08)',
  glassStrong: 'rgba(8,28,18,0.92)',
  glassBorder: 'rgba(190,242,220,0.16)',
} as const

export type ScoreComponent = 'water' | 'soil' | 'resilience' | 'income'

export const SCORE_COMPONENTS: { key: ScoreComponent; label: string; shape: MarkerShape }[] = [
  { key: 'water', label: 'Water', shape: 'circle' },
  { key: 'soil', label: 'Soil', shape: 'square' },
  { key: 'resilience', label: 'Resilience', shape: 'diamond' },
  { key: 'income', label: 'Income', shape: 'triangle' },
]

export type MarkerShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'line' | 'dashed' | 'hatch'

/** Shared Recharts styling from 02-UI-SPEC "Chart defaults". */
export const CHART_DEFAULTS = {
  tick: { fill: CHART_COLORS.fg2, fontSize: 14 },
  axisLine: { stroke: CHART_COLORS.grid },
  grid: { stroke: CHART_COLORS.grid, strokeDasharray: '3 3', vertical: false },
  lineWidth: 2.5,
  tooltip: {
    contentStyle: {
      background: CHART_COLORS.glassStrong,
      border: `1px solid ${CHART_COLORS.glassBorder}`,
      borderRadius: 12,
      padding: 8,
      color: CHART_COLORS.fg,
      fontSize: 14,
      backdropFilter: 'blur(16px)',
    },
    labelStyle: { color: CHART_COLORS.fg, fontWeight: 600 },
    itemStyle: { color: CHART_COLORS.fg2 },
    cursorFill: 'rgba(255,255,255,0.06)',
    cursorStroke: 'rgba(190,242,220,0.35)',
  },
} as const

export interface RotationSeriesStyle {
  color: string
  dashed: boolean
}

/**
 * Rotation series mapping (02-UI-SPEC): water_saving = water, soil_building = soil,
 * income = income, existing = dashed neutral. Duplicates and others use series-extra.
 */
export function rotationSeriesStyles(rotations: RotationScore[]): Map<string, RotationSeriesStyle> {
  const byStrategy: Record<string, string> = {
    water_saving: CHART_COLORS.water,
    soil_building: CHART_COLORS.soil,
    income: CHART_COLORS.income,
    resilience: CHART_COLORS.resilience,
  }
  const used = new Set<string>()
  const out = new Map<string, RotationSeriesStyle>()
  for (const r of rotations) {
    if (r.is_existing || r.strategy_type === 'existing') {
      out.set(r.rotation_id, { color: CHART_COLORS.existing, dashed: true })
      continue
    }
    const c = byStrategy[r.strategy_type]
    if (c && !used.has(c)) {
      used.add(c)
      out.set(r.rotation_id, { color: c, dashed: false })
    } else {
      out.set(r.rotation_id, { color: CHART_COLORS.seriesExtra, dashed: false })
    }
  }
  return out
}
