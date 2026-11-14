import { useId, useMemo } from 'react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { RotationScore } from '../types/api'
import {
  CHART_COLORS,
  CHART_DEFAULTS,
  rotationSeriesStyles,
  SCORE_COMPONENTS,
} from '../lib/charts/tokens'
import { Card, LegendRow, Marker } from '../lib/ui4/primitives'
import { cx, fg, type } from '../lib/ui4/cls'

export interface ScoreRadarProps {
  rotations: RotationScore[]
  className?: string
}

interface TickProps {
  x?: number | string
  y?: number | string
  textAnchor?: string
  payload?: { value?: string }
}

const COMPONENT_BY_LABEL = new Map(SCORE_COMPONENTS.map((c) => [c.label, c]))

/** Axis label tinted with its component colour plus its marker shape (non-colour cue). */
function AxisTick({ x = 0, y = 0, textAnchor = 'middle', payload }: TickProps) {
  const label = payload?.value ?? ''
  const comp = COMPONENT_BY_LABEL.get(label)
  const color = comp ? CHART_COLORS[comp.key] : CHART_COLORS.fg2
  const nx = Number(x)
  const ny = Number(y)
  const anchor = textAnchor as 'start' | 'middle' | 'end'
  const markerX = anchor === 'start' ? nx : anchor === 'end' ? nx - 16 : nx - 8
  return (
    <g>
      {comp && (
        <g transform={`translate(${markerX}, ${ny - 26})`}>
          <Marker shape={comp.shape} color={color} />
        </g>
      )}
      <text x={nx} y={ny} textAnchor={anchor} dominantBaseline="central" fill={color} fontSize={14} fontWeight={600}>
        {label}
      </text>
    </g>
  )
}

const keyFor = (id: string) => `r_${id.replace(/[^a-zA-Z0-9_]/g, '_')}`

export default function ScoreRadar({ rotations, className }: ScoreRadarProps) {
  const titleId = useId()
  const summaryId = useId()
  const styles = useMemo(() => rotationSeriesStyles(rotations), [rotations])

  // Existing rotation drawn last so its dashed outline sits on top.
  const ordered = useMemo(
    () => [...rotations].sort((a, b) => Number(a.is_existing) - Number(b.is_existing)),
    [rotations],
  )

  const data = useMemo(
    () =>
      SCORE_COMPONENTS.map((c) => {
        const row: Record<string, string | number | null> = { axis: c.label }
        for (const r of rotations) {
          const v = r.scores?.[c.key]
          row[keyFor(r.rotation_id)] = typeof v === 'number' ? v : null
        }
        return row
      }),
    [rotations],
  )

  const summary = rotations
    .map((r) => {
      const parts = SCORE_COMPONENTS.map((c) => {
        const v = r.scores?.[c.key]
        return `${c.label.toLowerCase()} ${typeof v === 'number' ? Math.round(v) : 'unavailable'}`
      })
      return `${r.label}${r.is_existing ? ' (existing)' : ''}: ${parts.join(', ')}`
    })
    .join('. ')

  if (rotations.length === 0) {
    return (
      <div data-component="ScoreRadar" className={className}>
        <Card title="Score profile" titleId={titleId}>
          <p className={cx(type.body, fg.fg3)}>No rotations to compare</p>
        </Card>
      </div>
    )
  }

  return (
    <div data-component="ScoreRadar" className={className}>
      <Card title="Score profile" titleId={titleId}>
        <LegendRow
          items={rotations.map((r) => {
            const s = styles.get(r.rotation_id)!
            return {
              label: r.is_existing ? `${r.label} (existing)` : r.label,
              color: s.color,
              shape: s.dashed ? 'dashed' : 'line',
            }
          })}
        />
        <div
          role="img"
          aria-label="Radar chart of water, soil, resilience and income scores from 0 to 100 for each rotation"
          aria-describedby={summaryId}
          className="h-[280px] w-full min-w-0 md:h-[340px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} outerRadius="68%" margin={{ top: 24, right: 32, bottom: 16, left: 32 }}>
              <PolarGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <PolarAngleAxis dataKey="axis" tick={(p: TickProps) => <AxisTick {...p} />} />
              <PolarRadiusAxis
                domain={[0, 100]}
                tickCount={5}
                angle={90}
                tick={{ fill: CHART_COLORS.fg3, fontSize: 12 }}
                axisLine={false}
              />
              <Tooltip
                contentStyle={CHART_DEFAULTS.tooltip.contentStyle}
                labelStyle={CHART_DEFAULTS.tooltip.labelStyle}
                itemStyle={CHART_DEFAULTS.tooltip.itemStyle}
                formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(1) : 'unavailable')}
              />
              {ordered.map((r) => {
                const s = styles.get(r.rotation_id)!
                return (
                  <Radar
                    key={r.rotation_id}
                    name={r.is_existing ? `${r.label} (existing)` : r.label}
                    dataKey={keyFor(r.rotation_id)}
                    stroke={s.color}
                    strokeWidth={s.dashed ? 2 : CHART_DEFAULTS.lineWidth}
                    strokeDasharray={s.dashed ? '6 4' : undefined}
                    strokeLinejoin="round"
                    fill={s.color}
                    fillOpacity={s.dashed ? 0 : 0.12}
                    dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                )
              })}
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <p id={summaryId} className="sr-only">
          Scores out of 100. {summary}.
        </p>
      </Card>
    </div>
  )
}
