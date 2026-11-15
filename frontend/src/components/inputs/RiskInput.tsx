import { CloudLightning } from 'lucide-react'
import { BAD_SEASONS, type BadSeasons } from '../../store/farmInputs'
import { ChoiceGroup, InputSection } from './controls'
import { hintCls } from './styles'

export default function RiskInput({ value, onChange }: { value: BadSeasons; onChange: (v: BadSeasons) => void }) {
  const answer = BAD_SEASONS.find((b) => b.v === value)?.label ?? ''
  return (
    <InputSection icon={CloudLightning} title="Bad seasons I can accept" answer={answer}>
      <p className={hintCls}>A bad season is a year when heat, frost or drought badly hurts the harvest.</p>
      <ChoiceGroup
        legend="How many bad seasons in 10 years can you live with?"
        value={value}
        options={BAD_SEASONS.map((b) => ({ v: b.v, label: b.label }))}
        onChange={onChange}
      />
    </InputSection>
  )
}
