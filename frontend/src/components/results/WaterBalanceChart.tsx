import { useId, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RotationScore } from '../../types/api'
import { CHART_COLORS, CHART_DEFAULTS } from '../../lib/charts/tokens'
import { Card, LegendRow } from '../../lib/ui4/primitives'
import { cx, fg, type } from '../../lib/ui4/cls'
import { evidenceValue } from './shared'
import { Term } from '../ui/Term'

const SHORTFALL = '#fda4af'

/**
 * Mean crop water demand per season (FAO-56 Kc x ETo) split into the part met by effective
 * rain + root-zone soil water + irrigation, and the shortfall. One mm axis.
 */
export default function WaterBalanceChart({ rotations }: { rotations: RotationScore[] }) {
  const titleId = useId()
  const summaryId = useId()
  const data = useMemo(
    () =>
      rotations
        .map((r) => {
          const demand = evidenceValue(r, 'mean_season_water_demand_mm')
          const deficit = evidenceValue(r, 'mean_season_water_deficit_mm') ?? 0
          if (demand === null) return null
          const short = Math.min(deficit, demand)
          return {
            name: r.is_existing ? `${r.label} (current)` : r.label,
            met: Math.max(0, demand - short),
            short,
            demand,
          }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [rotations],
  )

  if (data.length === 0) {
    return (
      <Card title={<Term id="water_balance">Water balance per season</Term>} titleId={titleId}>
        <p className={cx('m-0', type.body, fg.fg3)}>Water demand was not computed for these rotations.</p>
      </Card>
    )
  }

  const summary = data
    .map((d) => `${d.name}: demand ${Math.round(d.demand)} mm, shortfall ${Math.round(d.short)} mm`)
    .join('. ')

  return (
    <Card title={<Term id="water_balance">Water balance per season</Term>} titleId={titleId}>
      <p className={cx('-mt-2 m-0', type.label, fg.fg3)}>
        Mean crop water demand per season (FAO-56 crop coefficients × reference <Term id="eto">ET</Term>) and how much of it{' '}
        <Term id="effective_rain">effective rain</Term>, stored soil water and your irrigation leave unmet.
      </p>
      <LegendRow
        items={[
          { label: 'Met by rain, soil and irrigation', color: CHART_COLORS.water, shape: 'square' },
          { label: 'Shortfall', color: SHORTFALL, shape: 'square' },
        ]}
      />
      <div
        role="img"
        aria-label="Horizontal stacked bar chart of seasonal crop water demand in millimetres for each rotation"
        aria-describedby={summaryId}
        className="w-full min-w-0"
        style={{ height: Math.max(200, data.length * 52 + 40) }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={14}>
            <CartesianGrid {...CHART_DEFAULTS.grid} horizontal={false} vertical />
            <XAxis
              type="number"
              tick={CHART_DEFAULTS.tick}
              axisLine={CHART_DEFAULTS.axisLine}
              tickLine={false}
              unit=" mm"
            />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              tick={{ ...CHART_DEFAULTS.tick, fontSize: 13 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={CHART_DEFAULTS.tooltip.contentStyle}
              labelStyle={CHART_DEFAULTS.tooltip.labelStyle}
              itemStyle={CHART_DEFAULTS.tooltip.itemStyle}
              cursor={{ fill: CHART_DEFAULTS.tooltip.cursorFill }}
              formatter={(v: unknown, name: unknown) => [`${Math.round(Number(v))} mm`, String(name)]}
            />
            <Bar dataKey="met" name="Met" stackId="w" fill={CHART_COLORS.water} radius={[4, 0, 0, 4]} isAnimationActive={false} />
            <Bar dataKey="short" name="Shortfall" stackId="w" fill={SHORTFALL} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="demand"
                position="right"
                formatter={(v: unknown) => `${Math.round(Number(v))}`}
                style={{ fill: CHART_COLORS.fg2, fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p id={summaryId} className="sr-only">
        {summary}.
      </p>
    </Card>
  )
}
