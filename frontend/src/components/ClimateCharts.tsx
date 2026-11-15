import { useId, useMemo, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { FieldProfile } from '../types/api'
import {
  aggregateMonthly,
  BARE_NDVI_THRESHOLD,
  bareRuns,
  extremes,
  missingMonths,
  MONTH_LABELS,
  monthRangeLabel,
  type MonthlyMean,
} from '../lib/charts/monthly'
import { CHART_COLORS, CHART_DEFAULTS, type MarkerShape } from '../lib/charts/tokens'
import { Card, LegendRow } from '../lib/ui4/primitives'
import { cx, fg, type } from '../lib/ui4/cls'
import { Term } from './ui/Term'

export interface ClimateChartsProps {
  profile: FieldProfile
  className?: string
}

type Key = 'rain_mm' | 'ndvi' | 'moisture'

const fmt = {
  rain_mm: (v: number) => `${v.toFixed(1)} mm`,
  ndvi: (v: number) => v.toFixed(2),
  moisture: (v: number) => `${v.toFixed(3)} m³/m³`,
}

const tooltipProps = {
  contentStyle: CHART_DEFAULTS.tooltip.contentStyle,
  labelStyle: CHART_DEFAULTS.tooltip.labelStyle,
  itemStyle: CHART_DEFAULTS.tooltip.itemStyle,
}

function tooltipFormatter(key: Key) {
  return (value: unknown) =>
    typeof value === 'number' ? fmt[key](value) : 'No observation'
}

function sanitizeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

function ChartFrame({
  title,
  legend,
  ariaLabel,
  summary,
  children,
}: {
  title: ReactNode
  legend: { label: string; color: string; shape: MarkerShape }[]
  ariaLabel: string
  summary: string
  children: ReactNode
}) {
  const titleId = useId()
  const summaryId = useId()
  return (
    <Card title={title} titleId={titleId}>
      <LegendRow items={legend} />
      <div
        role="img"
        aria-label={ariaLabel}
        aria-describedby={summaryId}
        className="h-[200px] w-full min-w-0 md:h-[240px]"
      >
        {children}
      </div>
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
    </Card>
  )
}

function missingNote(data: MonthlyMean[], key: Key): string {
  const m = missingMonths(data, key)
  return m.length ? ` No observations for ${m.join(', ')}; shown as gaps.` : ''
}

function valuesList(data: MonthlyMean[], key: Key): string {
  return data
    .map((d) => `${d.label} ${d[key] === null ? 'no observation' : fmt[key](d[key] as number)}`)
    .join('; ')
}

const monthTick = (m: number) => MONTH_LABELS[m - 1] ?? ''

export default function ClimateCharts({ profile, className }: ClimateChartsProps) {
  const patternId = `bare-hatch-${sanitizeId(useId())}`
  const data = useMemo(() => aggregateMonthly(profile.monthly ?? []), [profile.monthly])
  const runs = useMemo(() => bareRuns(data), [data])
  const years = `${profile.period_start.slice(0, 4)}–${profile.period_end.slice(0, 4)}`
  const span = `long-term monthly means, ${years} (${profile.n_years} years)`

  const rainExt = extremes(data, 'rain_mm')
  const rainTotal = data.every((d) => d.rain_mm === null)
    ? null
    : data.reduce((s, d) => s + (d.rain_mm ?? 0), 0)
  const ndviExt = extremes(data, 'ndvi')
  const smExt = extremes(data, 'moisture')

  const rainSummary = rainExt
    ? `Monthly rainfall, ${span}. Wettest month ${rainExt.max.label} at ${fmt.rain_mm(rainExt.max.rain_mm!)}, driest ${rainExt.min.label} at ${fmt.rain_mm(rainExt.min.rain_mm!)}${rainTotal !== null ? `, about ${Math.round(rainTotal)} mm a year` : ''}.${missingNote(data, 'rain_mm')} Values: ${valuesList(data, 'rain_mm')}.`
    : 'No rainfall observations for this field.'
  const bareText = runs.length
    ? `Bare periods (mean NDVI below ${BARE_NDVI_THRESHOLD}): ${runs.map(monthRangeLabel).join(', ')}.`
    : `No month has mean NDVI below ${BARE_NDVI_THRESHOLD}.`
  const ndviSummary = ndviExt
    ? `NDVI vegetation greenness, ${span}. Peak ${fmt.ndvi(ndviExt.max.ndvi!)} in ${ndviExt.max.label}, lowest ${fmt.ndvi(ndviExt.min.ndvi!)} in ${ndviExt.min.label}. ${bareText}${missingNote(data, 'ndvi')} Values: ${valuesList(data, 'ndvi')}.`
    : 'No NDVI observations for this field.'
  const smSummary = smExt
    ? `Root-zone soil moisture, ${span}. Wettest ${smExt.max.label} at ${fmt.moisture(smExt.max.moisture!)}, driest ${smExt.min.label} at ${fmt.moisture(smExt.min.moisture!)}.${missingNote(data, 'moisture')} Values: ${valuesList(data, 'moisture')}.`
    : 'No root-zone soil moisture observations for this field.'

  const xNumeric = {
    dataKey: 'month',
    type: 'number' as const,
    domain: [0.5, 12.5] as [number, number],
    ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    tickFormatter: monthTick,
    tick: CHART_DEFAULTS.tick,
    axisLine: CHART_DEFAULTS.axisLine,
    tickLine: false,
    interval: 'preserveStartEnd' as const,
    minTickGap: 4,
  }
  const yCommon = {
    tick: CHART_DEFAULTS.tick,
    axisLine: false,
    tickLine: false,
    width: 48,
  }

  return (
    <div data-component="ClimateCharts" className={cx('grid gap-4 xl:grid-cols-3', className)}>
      <ChartFrame
        title="Monthly rain"
        legend={[{ label: 'Rain (mm)', color: CHART_COLORS.water, shape: 'square' }]}
        ariaLabel={`Bar chart of mean monthly rainfall in millimetres, ${years}`}
        summary={rainSummary}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...CHART_DEFAULTS.grid} />
            <XAxis
              dataKey="label"
              tick={CHART_DEFAULTS.tick}
              axisLine={CHART_DEFAULTS.axisLine}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={4}
            />
            <YAxis {...yCommon} />
            <Tooltip
              {...tooltipProps}
              cursor={{ fill: CHART_DEFAULTS.tooltip.cursorFill }}
              formatter={tooltipFormatter('rain_mm')}
            />
            <Bar
              dataKey="rain_mm"
              name="Rain"
              fill={CHART_COLORS.water}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title={<>Vegetation (<Term id="ndvi">NDVI</Term>)</>}
        legend={[
          { label: 'NDVI', color: CHART_COLORS.ndvi, shape: 'line' },
          { label: `Bare period (NDVI < ${BARE_NDVI_THRESHOLD})`, color: CHART_COLORS.bare, shape: 'hatch' },
        ]}
        ariaLabel={`Line chart of mean monthly NDVI, ${years}, with bare periods shaded`}
        summary={ndviSummary}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <pattern id={patternId} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                <rect width="8" height="8" fill={CHART_COLORS.bare} fillOpacity="0.22" />
                <line x1="0" y1="0" x2="0" y2="8" stroke={CHART_COLORS.bare} strokeWidth="2" strokeOpacity="0.7" />
              </pattern>
            </defs>
            <CartesianGrid {...CHART_DEFAULTS.grid} />
            {runs.map(([a, b]) => (
              <ReferenceArea
                key={`${a}-${b}`}
                x1={a - 0.5}
                x2={b + 0.5}
                fill={`url(#${patternId})`}
                fillOpacity={1}
                stroke="none"
                ifOverflow="hidden"
              />
            ))}
            <XAxis {...xNumeric} />
            <YAxis {...yCommon} domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} />
            <Tooltip
              {...tooltipProps}
              cursor={{ stroke: CHART_DEFAULTS.tooltip.cursorStroke }}
              labelFormatter={(m) => monthTick(Number(m))}
              formatter={tooltipFormatter('ndvi')}
            />
            <Line
              type="monotone"
              dataKey="ndvi"
              name="NDVI"
              stroke={CHART_COLORS.ndvi}
              strokeWidth={CHART_DEFAULTS.lineWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={{ r: 3, fill: CHART_COLORS.ndvi, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      <ChartFrame
        title={<Term id="rootzone">Root-zone soil moisture</Term>}
        legend={[{ label: 'Soil moisture (m³/m³)', color: CHART_COLORS.moisture, shape: 'line' }]}
        ariaLabel={`Line chart of mean monthly root-zone soil moisture, ${years}`}
        summary={smSummary}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...CHART_DEFAULTS.grid} />
            <XAxis {...xNumeric} />
            <YAxis {...yCommon} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toFixed(2)} />
            <Tooltip
              {...tooltipProps}
              cursor={{ stroke: CHART_DEFAULTS.tooltip.cursorStroke }}
              labelFormatter={(m) => monthTick(Number(m))}
              formatter={tooltipFormatter('moisture')}
            />
            <Line
              type="monotone"
              dataKey="moisture"
              name="Soil moisture"
              stroke={CHART_COLORS.moisture}
              strokeWidth={CHART_DEFAULTS.lineWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={{ r: 3, fill: CHART_COLORS.moisture, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
      <p className={cx('xl:col-span-3', type.label, 'font-normal', fg.fg3)}>
        Each chart shows the mean for each calendar month across {profile.n_years} years. Missing
        months are gaps, not zeros.
      </p>
    </div>
  )
}
