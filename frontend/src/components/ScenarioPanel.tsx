import { useId } from 'react'
import { FlaskConical, RotateCcw } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { Card } from '../lib/ui4/primitives'
import { Slider } from '../lib/ui4/Slider'
import { cx, fg, type } from '../lib/ui4/cls'

export const SCENARIO_LABEL = 'Simulated conditions, not a NASA forecast'
const DEFAULT_SCENARIO = { rain_multiplier: 1.0, temp_delta_c: 0.0 }

// Round to the slider step so float noise (0.6000000001) never reaches the API.
const snap = (v: number, step: number) => Math.round(v / step) * step

function formatRain(m: number): string {
  const pct = Math.round((m - 1) * 100)
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

function formatTemp(d: number): string {
  return `+${d.toFixed(1)} °C`
}

export interface ScenarioPanelProps {
  /** Optional: pass CompareResponse.scenario_applied to show whether results reflect the scenario. */
  scenarioApplied?: boolean
  className?: string
}

export default function ScenarioPanel({ scenarioApplied, className }: ScenarioPanelProps) {
  const titleId = useId()
  const scenario = useAppStore((s) => s.scenario)
  const setScenario = useAppStore((s) => s.setScenario)
  const isDefault =
    scenario.rain_multiplier === DEFAULT_SCENARIO.rain_multiplier &&
    scenario.temp_delta_c === DEFAULT_SCENARIO.temp_delta_c

  return (
    <div data-component="ScenarioPanel" className={className}>
      <Card
        title="Scenario"
        titleId={titleId}
        actions={
          <button
            type="button"
            onClick={() => setScenario({ ...DEFAULT_SCENARIO })}
            disabled={isDefault}
            aria-disabled={isDefault}
            className={cx(
              'inline-flex h-11 items-center gap-2 rounded-[var(--radius-control,1rem)] px-4 font-semibold',
              'border border-[color:var(--color-control-border,rgba(190,242,220,0.45))]',
              'bg-[color:var(--color-glass-flat,rgba(255,255,255,0.04))] hover:bg-[rgba(255,255,255,0.08)] active:scale-[0.98]',
              'disabled:pointer-events-none disabled:opacity-50',
              type.label,
              fg.fg,
            )}
          >
            <RotateCcw size={20} aria-hidden="true" />
            Reset scenario
          </button>
        }
      >
        <p
          className={cx(
            'inline-flex items-center gap-2 self-start rounded-full border border-dashed px-3 py-1 font-semibold',
            'border-[color:var(--color-demo,#fbbf24)] bg-[rgba(251,191,36,0.14)]',
            type.label,
            fg.demo,
          )}
        >
          <FlaskConical size={16} aria-hidden="true" />
          {SCENARIO_LABEL}
        </p>
        <div className="flex flex-col gap-4">
          <Slider
            label="Rainfall change"
            tone="simulated"
            min={0.6}
            max={1.4}
            step={0.05}
            value={scenario.rain_multiplier}
            format={formatRain}
            valueText={(v) => `${formatRain(v)} rainfall versus the long-term record`}
            helperText="Scales every month's rainfall from -40% to +40%."
            onChange={(v) => setScenario({ ...scenario, rain_multiplier: Number(snap(v, 0.05).toFixed(2)) })}
          />
          <Slider
            label="Temperature change"
            tone="simulated"
            min={0}
            max={4}
            step={0.5}
            value={scenario.temp_delta_c}
            format={formatTemp}
            valueText={(v) => `${formatTemp(v)} warmer than the long-term record`}
            helperText="Adds 0 to 4 °C to every month's temperature."
            onChange={(v) => setScenario({ ...scenario, temp_delta_c: Number(snap(v, 0.5).toFixed(1)) })}
          />
        </div>
        {scenarioApplied !== undefined && (
          <p role="status" aria-live="polite" className={cx(type.label, 'font-normal', fg.fg3)}>
            {scenarioApplied
              ? 'Scores below reflect this simulated scenario.'
              : 'Scores below use the observed long-term record.'}
          </p>
        )}
      </Card>
    </div>
  )
}
