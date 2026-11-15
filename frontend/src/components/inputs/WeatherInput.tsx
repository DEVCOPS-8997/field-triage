import { FlaskConical, ThermometerSun } from 'lucide-react'
import { fmtNumber, scaledRainMm } from '../../lib/units'
import { RAIN_CHOICES, WARMING_CHOICES } from '../../store/farmInputs'
import { cx, fg, type } from '../../lib/ui4/cls'
import { ChoiceGroup, InputSection } from './controls'
import { hintCls } from './styles'

function rainPct(m: number): string {
  const p = Math.round((m - 1) * 100)
  return p === 0 ? '' : p > 0 ? `+${p}%` : `${p}%`
}

export default function WeatherInput({
  rainMultiplier,
  warmingC,
  annualRainMm,
  onRain,
  onWarming,
  scenarioApplied,
}: {
  rainMultiplier: number
  warmingC: number
  annualRainMm: number | null
  onRain: (v: number) => void
  onWarming: (v: number) => void
  scenarioApplied: boolean | undefined
}) {
  const rainLabel = RAIN_CHOICES.find((c) => c.v === rainMultiplier)?.label ?? 'Normal'
  const warmLabel = WARMING_CHOICES.find((c) => c.v === warmingC)?.label ?? 'Same as now'
  const changed = rainMultiplier !== 1 || warmingC !== 0
  const rainNow = scaledRainMm(annualRainMm, rainMultiplier)
  const answer = changed
    ? `Rain: ${rainLabel.toLowerCase()} · Heat: ${warmLabel.toLowerCase()}${warmingC ? ` (+${warmingC} °C)` : ''}`
    : 'Same weather as past years'

  return (
    <InputSection icon={ThermometerSun} title="What if the weather changes" answer={answer}>
      <p
        className={cx(
          'm-0 inline-flex items-center gap-2 self-start rounded-full border border-dashed px-3 py-1 font-semibold',
          'border-[color:var(--color-demo,#fbbf24)] bg-[rgba(251,191,36,0.14)]',
          type.label,
          fg.demo,
        )}
      >
        <FlaskConical size={16} aria-hidden="true" />
        A "what if" test, not a forecast
      </p>
      <ChoiceGroup
        legend="Rain in a year"
        value={rainMultiplier}
        options={RAIN_CHOICES.map((c) => {
          const mm = scaledRainMm(annualRainMm, c.v)
          return {
            v: c.v,
            label: (
              <span className="flex flex-col items-start leading-tight">
                <span>{c.label}</span>
                <span className="text-[12px] font-normal opacity-80">
                  {mm !== null ? `${fmtNumber(mm)} mm` : rainPct(c.v) || 'as now'}
                </span>
              </span>
            ),
          }
        })}
        onChange={onRain}
      />
      {annualRainMm !== null && (
        <p className={hintCls}>
          This spot gets about {fmtNumber(annualRainMm)} mm of rain a year now.
          {rainMultiplier !== 1 && rainNow !== null ? ` The test uses ${fmtNumber(rainNow)} mm (${rainPct(rainMultiplier)}).` : ''}
        </p>
      )}
      <ChoiceGroup
        legend="Heat"
        value={warmingC}
        options={WARMING_CHOICES.map((c) => ({
          v: c.v,
          label: (
            <span className="flex flex-col items-start leading-tight">
              <span>{c.label}</span>
              <span className="text-[12px] font-normal opacity-80">{c.v === 0 ? 'as now' : `+${c.v} °C`}</span>
            </span>
          ),
        }))}
        onChange={onWarming}
      />
      <p className={hintCls}>Every day of the past record is made this much warmer.</p>
      {changed && (
        <button
          type="button"
          onClick={() => {
            onRain(1)
            onWarming(0)
          }}
          className={cx(
            'inline-flex min-h-[44px] items-center self-start rounded-[var(--radius-control,1rem)] border px-4 font-semibold',
            'border-[color:var(--color-control-border,rgba(190,242,220,0.45))] hover:bg-[rgba(255,255,255,0.08)]',
            type.label,
            fg.fg,
          )}
        >
          Back to normal weather
        </button>
      )}
      {scenarioApplied !== undefined && (
        <p role="status" aria-live="polite" className={hintCls}>
          {scenarioApplied ? 'Results below use this "what if" weather.' : 'Results below use the real past weather.'}
        </p>
      )}
    </InputSection>
  )
}
