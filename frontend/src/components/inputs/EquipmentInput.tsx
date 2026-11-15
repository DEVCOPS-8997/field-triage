import { Tractor } from 'lucide-react'
import type { EquipmentId } from '../../types/api'
import { EQUIPMENT } from '../../store/farmInputs'
import { cx, fg, type } from '../../lib/ui4/cls'
import { InputSection } from './controls'
import { hintCls } from './styles'

export default function EquipmentInput({
  value,
  onChange,
}: {
  value: EquipmentId[]
  onChange: (v: EquipmentId[]) => void
}) {
  const toggle = (id: EquipmentId, on: boolean) =>
    onChange(on ? [...new Set([...value, id])] : value.filter((v) => v !== id))
  const answer = value.length === 0 ? 'I have everything' : `${value.length} missing`
  return (
    <InputSection icon={Tractor} title="Equipment I do NOT have" answer={answer}>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className={cx('mb-1 p-0', type.label, fg.fg2)}>Tick what you cannot get or hire</legend>
        {EQUIPMENT.map((e) => {
          const checked = value.includes(e.id)
          return (
            <label
              key={e.id}
              className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-[rgba(255,255,255,0.05)]"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(ev) => toggle(e.id, ev.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--color-accent,#4ade80)]"
              />
              <span className="flex min-w-0 flex-col">
                <span className={cx('font-semibold', type.label, fg.fg)}>{e.label}</span>
                <span className={hintCls}>{e.hint}</span>
              </span>
            </label>
          )
        })}
      </fieldset>
    </InputSection>
  )
}
