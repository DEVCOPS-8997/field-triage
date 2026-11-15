import { RotateCcw } from 'lucide-react'
import { Card } from '../../lib/ui4/primitives'
import { cx, fg, type } from '../../lib/ui4/cls'
import { DEFAULT_INPUTS, type FarmInputs } from '../../store/farmInputs'
import EquipmentInput from './EquipmentInput'
import GoalOrder from './GoalOrder'
import IncomeInput from './IncomeInput'
import RiskInput from './RiskInput'
import WaterInput from './WaterInput'
import WeatherInput from './WeatherInput'

/** "About your farm": real-unit limits, goal order and a what-if weather test. */
export default function FarmInputsPanel({
  inputs,
  update,
  reset,
  urlAreaHa,
  irrigationLabel,
  annualRainMm,
  incomeNote,
  scenarioApplied,
  live,
}: {
  inputs: FarmInputs
  update: <K extends keyof FarmInputs>(key: K, value: FarmInputs[K]) => void
  reset: () => void
  urlAreaHa: number | null
  irrigationLabel: string
  annualRainMm: number | null
  incomeNote: string | null
  scenarioApplied: boolean | undefined
  /** True once results exist, so changes update them straight away. */
  live: boolean
}) {
  const isDefault = JSON.stringify({ ...inputs, area: DEFAULT_INPUTS.area }) === JSON.stringify({ ...DEFAULT_INPUTS, area: DEFAULT_INPUTS.area })
  return (
    <Card
      title="About your farm"
      titleId="farm-inputs-title"
      actions={
        <button
          type="button"
          onClick={reset}
          disabled={isDefault}
          className={cx(
            'inline-flex min-h-[40px] items-center gap-2 rounded-[var(--radius-control,1rem)] border px-3 font-semibold',
            'border-[color:var(--color-control-border,rgba(190,242,220,0.45))] hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-40',
            type.label,
            fg.fg,
          )}
        >
          <RotateCcw size={16} aria-hidden="true" />
          Clear
        </button>
      }
    >
      <p className={cx('m-0', type.label, fg.fg2)}>
        {live
          ? 'Answer what you can. Results update by themselves.'
          : 'Answer what you can, then run the analysis. Skip anything you are unsure about.'}
      </p>
      <div className="flex flex-col gap-2">
        <WaterInput
          inputs={inputs}
          urlAreaHa={urlAreaHa}
          onChange={(w) => update('water', w)}
          onAreaChange={(a) => update('area', a)}
          irrigationLabel={irrigationLabel}
        />
        <IncomeInput inputs={inputs} onChange={(i) => update('income', i)} incomeNote={incomeNote} />
        <RiskInput value={inputs.badSeasons} onChange={(v) => update('badSeasons', v)} />
        <EquipmentInput value={inputs.noEquipment} onChange={(v) => update('noEquipment', v)} />
        <GoalOrder goals={inputs.goals} onChange={(g) => update('goals', g)} incomeNotScored={!!incomeNote} />
        <WeatherInput
          rainMultiplier={inputs.rainMultiplier}
          warmingC={inputs.warmingC}
          annualRainMm={annualRainMm}
          onRain={(v) => update('rainMultiplier', v)}
          onWarming={(v) => update('warmingC', v)}
          scenarioApplied={scenarioApplied}
        />
      </div>
    </Card>
  )
}
