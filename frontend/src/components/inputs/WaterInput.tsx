import { Droplets } from 'lucide-react'
import {
  AREA_UNIT_LABEL,
  WATER_UNIT_LABEL,
  fmtNumber,
  haToAcres,
  needsArea,
  type AreaUnit,
  type WaterUnit,
} from '../../lib/units'
import { fieldAreaM2, waterMm, type FarmInputs } from '../../store/farmInputs'
import { ChoiceGroup, ConversionLine, InputSection, NumberInput, SelectInput } from './controls'
import { hintCls } from './styles'

const WATER_UNITS = (Object.keys(WATER_UNIT_LABEL) as WaterUnit[]).map((v) => ({ v, label: WATER_UNIT_LABEL[v] }))
const AREA_UNITS = (Object.keys(AREA_UNIT_LABEL) as AreaUnit[]).map((v) => ({ v, label: AREA_UNIT_LABEL[v] }))

function areaWords(m2: number): string {
  const acres = haToAcres(m2 / 10_000)
  return `${fmtNumber(acres, acres < 10 ? 1 : 0)}-acre`
}

export default function WaterInput({
  inputs,
  urlAreaHa,
  onChange,
  onAreaChange,
  irrigationLabel,
}: {
  inputs: FarmInputs
  urlAreaHa: number | null
  onChange: (w: FarmInputs['water']) => void
  onAreaChange: (a: FarmInputs['area']) => void
  irrigationLabel: string
}) {
  const w = inputs.water
  const mm = waterMm(inputs, urlAreaHa)
  const areaM2 = fieldAreaM2(inputs, urlAreaHa)
  const volume = needsArea(w.unit)
  const set = (patch: Partial<FarmInputs['water']>) => onChange({ ...w, ...patch })

  const answer = !w.known
    ? `I don't know (uses "${irrigationLabel}")`
    : mm !== null
      ? `${fmtNumber(mm)} mm per season`
      : 'Not finished yet'

  return (
    <InputSection icon={Droplets} title="Water I can give per crop season" answer={answer}>
      <ChoiceGroup
        legend="Do you know how much water you can give?"
        value={w.known ? 'yes' : 'no'}
        options={[
          { v: 'yes', label: 'Yes, I know' },
          { v: 'no', label: "I don't know" },
        ]}
        onChange={(v) => set({ known: v === 'yes' })}
      />
      {!w.known && (
        <p className={hintCls}>We will use your irrigation choice above ("{irrigationLabel}") instead.</p>
      )}
      {w.known && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2">
            <NumberInput label="Amount" value={w.amount} onChange={(amount) => set({ amount })} placeholder="e.g. 12" />
            <SelectInput label="Unit" value={w.unit} options={WATER_UNITS} onChange={(unit) => set({ unit })} />
          </div>

          {w.unit === 'tubewell_hours' && (
            <NumberInput
              label="Tubewell flow"
              suffix="litres/sec"
              value={w.tubewellLps}
              onChange={(tubewellLps) => set({ tubewellLps })}
              hint="A farm tubewell gives about 15 to 30 litres per second (28 is about 1 cusec). Ask your mechanic, or time how long it takes to fill a drum."
            />
          )}
          {w.unit === 'canal_turns' && (
            <div className="grid grid-cols-2 gap-2">
              <NumberInput
                label="Hours per turn"
                suffix="hours"
                value={w.hoursPerTurn}
                onChange={(hoursPerTurn) => set({ hoursPerTurn })}
              />
              <NumberInput
                label="Water at your outlet"
                suffix="cusecs"
                value={w.canalCusecs}
                onChange={(canalCusecs) => set({ canalCusecs })}
              />
              <p className={`${hintCls} col-span-2`}>
                Count the turns you get in one crop season. Most outlets give about 1 cusec; your irrigation office can tell
                you yours.
              </p>
            </div>
          )}

          {volume && urlAreaHa === null && (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <NumberInput
                label="Field size"
                value={inputs.area.value}
                onChange={(value) => onAreaChange({ ...inputs.area, value })}
                placeholder="e.g. 2.5"
              />
              <SelectInput
                label="Size unit"
                value={inputs.area.unit}
                options={AREA_UNITS}
                onChange={(unit) => onAreaChange({ ...inputs.area, unit })}
              />
              <p className={`${hintCls} col-span-2`}>1 acre = 8 kanal. We need the size to turn a volume of water into depth.</p>
            </div>
          )}

          {mm !== null ? (
            <ConversionLine>
              = {fmtNumber(mm)} mm{volume && areaM2 ? ` over your ${areaWords(areaM2)} field` : ''}
              {mm > 3000 ? ' (we cap this at 3,000 mm)' : ''}
            </ConversionLine>
          ) : (
            <ConversionLine tone="warn">
              {w.amount === null
                ? 'Enter an amount.'
                : volume && areaM2 === null
                  ? 'Enter your field size to work this out.'
                  : 'Check the numbers above.'}
            </ConversionLine>
          )}
        </>
      )}
    </InputSection>
  )
}
