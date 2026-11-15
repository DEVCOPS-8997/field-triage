import { useId, useMemo, type ReactNode } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { FieldProfile } from '../../types/api'
import { CHART_COLORS, CHART_DEFAULTS, type MarkerShape } from '../../lib/charts/tokens'
import { Card, LegendRow } from '../../lib/ui4/primitives'
import { cx, fg, type } from '../../lib/ui4/cls'
import { monthlyClimate } from './shared'
import { Term } from '../ui/Term'

const ETO = '#fbbf24'
const TMAX = '#fb923c'
const TMIN = '#7dd3fc'

const tooltip = {
  contentStyle: CHART_DEFAULTS.tooltip.contentStyle,
  labelStyle: CHART_DEFAULTS.tooltip.labelStyle,
  itemStyle: CHART_DEFAULTS.tooltip.itemStyle,
}

function Frame({
  title,
  note,
  legend,
  aria,
  summary,
  children,
}: {
  title: ReactNode
  note: ReactNode
  legend: { label: string; color: string; shape: MarkerShape }[]
  aria: string
  summary: string
  children: ReactNode
}) {
  const titleId = useId()
  const summaryId = useId()
  return (
    <Card title={title} titleId={titleId}>
      <p className={cx('-mt-2 m-0', type.label, fg.fg3)}>{note}</p>
      <LegendRow items={legend} />
      <div role="img" aria-label={aria} aria-describedby={summaryId} className="h-[240px] w-full min-w-0 md:h-[260px]">
        {children}
      </div>
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
    </Card>
  )
}

/** Monthly rain vs reference ET (one mm axis) and the temperature envelope (one °C axis). */
export default function ClimatePanel({ profile }: { profile: FieldProfile }) {
  const data = useMemo(() => monthlyClimate(profile.monthly ?? []), [profile.monthly])
  const hasEto = data.some((d) => d.eto !== null)
  const r = (v: number | null, u: string, d = 0) => (v === null ? 'no data' : `${v.toFixed(d)} ${u}`)
  const deficitMonths = data.filter((d) => d.rain !== null && d.eto !== null && d.eto > d.rain).map((d) => d.label)

  const xAxis = {
    dataKey: 'label',
    tick: CHART_DEFAULTS.tick,
    axisLine: CHART_DEFAULTS.axisLine,
    tickLine: false,
    interval: 0 as const,
    tickFormatter: (s: string) => s.slice(0, 1),
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Frame
        title={
          <>
            Rain vs crop-water demand <Term id="eto" iconOnly />
          </>
        }
        note={
          hasEto ? (
            <>
              Monthly mean rain against FAO-56 reference <Term id="eto">evapotranspiration (ETo)</Term>. Months where the line
              sits above the bars need stored water or irrigation{deficitMonths.length ? `: ${deficitMonths.length} of 12 here` : ''}.
            </>
          ) : (
            'Monthly mean rain. Reference ET is unavailable for this location.'
          )
        }
        legend={[
          { label: 'Rain', color: CHART_COLORS.water, shape: 'square' },
          ...(hasEto ? [{ label: 'Reference ET (ETo)', color: ETO, shape: 'line' as MarkerShape }] : []),
        ]}
        aria="Bar and line chart of mean monthly rain and reference evapotranspiration in millimetres"
        summary={data.map((d) => `${d.label}: rain ${r(d.rain, 'mm')}, ETo ${r(d.eto, 'mm')}`).join('; ')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...CHART_DEFAULTS.grid} />
            <XAxis {...xAxis} />
            <YAxis tick={CHART_DEFAULTS.tick} axisLine={false} tickLine={false} width={44} unit="" />
            <Tooltip
              {...tooltip}
              cursor={{ fill: CHART_DEFAULTS.tooltip.cursorFill }}
              formatter={(v: unknown, n: unknown) => [typeof v === 'number' ? `${v.toFixed(0)} mm` : 'no data', String(n)]}
            />
            <Bar dataKey="rain" name="Rain" fill={CHART_COLORS.water} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            {hasEto && (
              <Line
                type="monotone"
                dataKey="eto"
                name="Reference ET"
                stroke={ETO}
                strokeWidth={CHART_DEFAULTS.lineWidth}
                dot={{ r: 3, fill: ETO, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </Frame>

      <Frame
        title="Temperature through the year"
        note={
          <>
            Shaded band runs from mean daily minimum to mean daily maximum; the line is the monthly mean. Hot maximums bring{' '}
            <Term id="heat_days">heat days</Term>; minimums near 0 °C bring <Term id="frost_risk">frost risk</Term>.
          </>
        }
        legend={[
          { label: 'Mean max', color: TMAX, shape: 'line' },
          { label: 'Mean', color: CHART_COLORS.fg, shape: 'dashed' },
          { label: 'Mean min', color: TMIN, shape: 'line' },
        ]}
        aria="Area chart of the monthly temperature range in degrees Celsius"
        summary={data
          .map((d) => `${d.label}: min ${r(d.tmin, '°C', 1)}, mean ${r(d.tmean, '°C', 1)}, max ${r(d.tmax, '°C', 1)}`)
          .join('; ')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="temp-band" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TMAX} stopOpacity={0.35} />
                <stop offset="100%" stopColor={TMIN} stopOpacity={0.25} />
              </linearGradient>
            </defs>
            <CartesianGrid {...CHART_DEFAULTS.grid} />
            <XAxis {...xAxis} />
            <YAxis tick={CHART_DEFAULTS.tick} axisLine={false} tickLine={false} width={44} unit="°" />
            <Tooltip
              {...tooltip}
              cursor={{ stroke: CHART_DEFAULTS.tooltip.cursorStroke }}
              formatter={(v: unknown, n: unknown) => {
                if (Array.isArray(v)) return [`${Number(v[0]).toFixed(1)} to ${Number(v[1]).toFixed(1)} °C`, 'Range']
                return [typeof v === 'number' ? `${v.toFixed(1)} °C` : 'no data', String(n)]
              }}
            />
            <Area dataKey="range" name="Range" stroke="none" fill="url(#temp-band)" isAnimationActive={false} />
            <Line type="monotone" dataKey="tmax" name="Mean max" stroke={TMAX} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="tmean"
              name="Mean"
              stroke={CHART_COLORS.fg}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line type="monotone" dataKey="tmin" name="Mean min" stroke={TMIN} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Frame>
    </div>
  )
}
