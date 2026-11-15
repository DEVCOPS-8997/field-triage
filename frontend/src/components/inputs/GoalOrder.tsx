import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ListOrdered } from 'lucide-react'
import { GOALS, RANK_WEIGHTS, type GoalKey } from '../../store/farmInputs'
import { cx, fg, tabular, type } from '../../lib/ui4/cls'
import { InputSection } from './controls'
import { hintCls } from './styles'

const PLACE = ['Most important', 'Second', 'Third', 'Least important']

export default function GoalOrder({
  goals,
  onChange,
  incomeNotScored,
}: {
  goals: GoalKey[]
  onChange: (g: GoalKey[]) => void
  incomeNotScored: boolean
}) {
  const [announce, setAnnounce] = useState('')
  const listRef = useRef<HTMLOListElement>(null)

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= goals.length) return
    const next = [...goals]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
    setAnnounce(`${GOALS[goals[i]]} moved to place ${j + 1} of 4.`)
    // Keep focus on the same arrow of the moved goal so repeated presses keep moving it.
    requestAnimationFrame(() => {
      const btn = listRef.current?.querySelector<HTMLButtonElement>(`[data-goal="${goals[i]}"][data-dir="${dir}"]`)
      if (btn && !btn.disabled) btn.focus()
      else listRef.current?.querySelector<HTMLButtonElement>(`[data-goal="${goals[i]}"]:not(:disabled)`)?.focus()
    })
  }

  const btnCls =
    'flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--color-glass-border,rgba(190,242,220,0.25))] text-[color:var(--color-fg,#ecfdf3)] hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-30'

  return (
    <InputSection icon={ListOrdered} title="What matters most" answer={goals.map((g) => GOALS[g]).join(' › ')}>
      <p className={hintCls}>Put the goal you care about most at the top. Use the arrows to move goals up or down.</p>
      <ol ref={listRef} className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Goals, most important first">
        {goals.map((g, i) => (
          <li
            key={g}
            className="flex items-center gap-2 rounded-xl bg-[rgba(255,255,255,0.04)] p-2"
          >
            <span
              className={cx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold',
                tabular,
                i === 0 ? 'bg-[color:var(--color-accent,#4ade80)] text-[#06240f]' : 'bg-[rgba(255,255,255,0.1)]',
              )}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cx('font-semibold', type.label, fg.fg)}>{GOALS[g]}</span>
              <span className={cx('text-[12px]', fg.fg3)}>
                {PLACE[i]} · counts {Math.round(RANK_WEIGHTS[i] * 100)}%
                {g === 'income' && incomeNotScored ? ' · no prices here' : ''}
              </span>
            </span>
            <button
              type="button"
              className={btnCls}
              data-goal={g}
              data-dir={-1}
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Move ${GOALS[g]} up`}
            >
              <ArrowUp size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={btnCls}
              data-goal={g}
              data-dir={1}
              disabled={i === goals.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Move ${GOALS[g]} down`}
            >
              <ArrowDown size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </InputSection>
  )
}
