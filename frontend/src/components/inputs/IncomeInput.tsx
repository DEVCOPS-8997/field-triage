import { Banknote } from 'lucide-react'
import { fmtNumber, type Currency, type PerArea } from '../../lib/units'
import { incomeUsdHa, type FarmInputs } from '../../store/farmInputs'
import { ConversionLine, InputSection, NumberInput, SelectInput } from './controls'
import { hintCls } from './styles'

export default function IncomeInput({
  inputs,
  onChange,
  incomeNote,
}: {
  inputs: FarmInputs
  onChange: (i: FarmInputs['income']) => void
  incomeNote: string | null
}) {
  const i = inputs.income
  const usdHa = incomeUsdHa(inputs)
  const set = (patch: Partial<FarmInputs['income']>) => onChange({ ...i, ...patch })
  const answer =
    i.amount === null
      ? 'No minimum'
      : `${i.currency === 'PKR' ? 'Rs' : '$'} ${fmtNumber(i.amount)} per ${i.per} a year`

  return (
    <InputSection icon={Banknote} title="Income I need" answer={answer}>
      <p className={hintCls}>The least crop sales you need from this field in a year, before costs. Leave empty for no minimum.</p>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
        <NumberInput label="Amount" value={i.amount} onChange={(amount) => set({ amount })} placeholder="e.g. 150000" />
        <SelectInput<Currency>
          label="Money"
          value={i.currency}
          options={[
            { v: 'PKR', label: 'Rupees (PKR)' },
            { v: 'USD', label: 'Dollars (USD)' },
          ]}
          onChange={(currency) => set({ currency })}
        />
      </div>
      <SelectInput<PerArea>
        label="For each"
        value={i.per}
        options={[
          { v: 'acre', label: 'acre' },
          { v: 'hectare', label: 'hectare' },
        ]}
        onChange={(per) => set({ per })}
      />
      {i.currency === 'PKR' && (
        <NumberInput
          label="Rupees per dollar"
          suffix="PKR = $1"
          value={i.pkrPerUsd}
          onChange={(pkrPerUsd) => set({ pkrPerUsd })}
          hint="Crop prices come in dollars. Check today's rate at your bank and change this if it is different."
        />
      )}
      {i.amount !== null &&
        (usdHa !== null ? (
          <ConversionLine>= about ${fmtNumber(usdHa)} per hectare a year</ConversionLine>
        ) : (
          <ConversionLine tone="warn">Enter the rupees-per-dollar rate.</ConversionLine>
        ))}
      {incomeNote && (
        <p className={hintCls}>
          <strong>Crop prices are missing for some crops here,</strong> so this minimum may not be checked. {incomeNote}
        </p>
      )}
    </InputSection>
  )
}
