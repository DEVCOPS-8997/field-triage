import { Check, RotateCcw } from 'lucide-react'
import type { Priorities } from '../types/api'
import { useAppStore } from '../store/useAppStore'
import { GlassCard } from '../lib/ui/GlassCard'
import { Pill } from '../lib/ui/Pill'
import { Slider } from '../lib/ui/Slider'
import { type ComponentKey, color, componentLabel, text, toneColor } from '../lib/ui/tokens'

type WeightKey = keyof Priorities

const ROWS: { key: WeightKey; component: ComponentKey }[] = [
  { key: 'w_water', component: 'water' },
  { key: 'w_soil', component: 'soil' },
  { key: 'w_income', component: 'income' },
  { key: 'w_resilience', component: 'resilience' },
]

const KEYS = ROWS.map((r) => r.key)
const EQUAL: Priorities = { w_water: 0.25, w_soil: 0.25, w_income: 0.25, w_resilience: 0.25 }

/** Distribute `total` integer units over weights in proportion (largest remainder). */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const shares = sum > 0 ? weights.map((w) => (w / sum) * total) : weights.map(() => total / weights.length)
  const floors = shares.map(Math.floor)
  let left = total - floors.reduce((a, b) => a + b, 0)
  const order = shares.map((s, i) => [s - floors[i], i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    floors[i] += 1
    left -= 1
  }
  return floors
}

/**
 * Set one weight and rescale the other three proportionally so the four
 * always sum to exactly 1.00 (worked in hundredths to avoid float drift).
 * If the others are all zero, the remainder is split equally between them.
 */
function rebalance(p: Priorities, key: WeightKey, next: number): Priorities {
  const moved = Math.round(Math.min(1, Math.max(0, next)) * 100)
  const others = KEYS.filter((k) => k !== key)
  const parts = apportion(
    100 - moved,
    others.map((k) => Math.max(0, Math.round(p[k] * 100))),
  )
  const out = { ...p, [key]: moved / 100 }
  others.forEach((k, i) => {
    out[k] = parts[i] / 100
  })
  return out
}

const isEqual = (p: Priorities) => KEYS.every((k) => Math.abs(p[k] - 0.25) < 0.005)

export default function PriorityPanel() {
  const priorities = useAppStore((s) => s.priorities)
  const setPriorities = useAppStore((s) => s.setPriorities)
  const total = KEYS.reduce((a, k) => a + priorities[k], 0)
  const equal = isEqual(priorities)

  return (
    <GlassCard
      as="section"
      data-component="PriorityPanel"
      aria-labelledby="priority-panel-title"
      title={<span id="priority-panel-title">Your priorities</span>}
      actions={
        <Pill tone="accent" icon={<Check size={16} strokeWidth={1.75} />}>
          <span className="tabular-nums" aria-live="polite">
            Total {total.toFixed(2)}
          </span>
        </Pill>
      }
    >
      <p className={`m-0 ${text.label}`} style={{ color: color.fg2 }}>
        Move a slider and the others adjust, so the weights always add up to 1.00.
      </p>

      {/* AllocationBar: segment widths = weights */}
      <div
        role="img"
        aria-label={`Weights: ${ROWS.map((r) => `${componentLabel[r.component]} ${priorities[r.key].toFixed(2)}`).join(', ')}`}
        className="mt-4 flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
      >
        {ROWS.map((r) =>
          priorities[r.key] > 0 ? (
            <div
              key={r.key}
              className="h-full rounded-full motion-safe:transition-[flex-grow] motion-safe:duration-[250ms]"
              style={{ flexGrow: priorities[r.key], flexBasis: 0, background: toneColor[r.component] }}
            />
          ) : null,
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {ROWS.map((r) => (
          <Slider
            key={r.key}
            label={componentLabel[r.component]}
            tone={r.component}
            value={priorities[r.key]}
            min={0}
            max={1}
            step={0.01}
            pageStep={0.05}
            onChange={(v) => setPriorities(rebalance(priorities, r.key, v))}
            valueText={`${priorities[r.key].toFixed(2)}, ${Math.round(priorities[r.key] * 100)} percent`}
          />
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => setPriorities({ ...EQUAL })}
          disabled={equal}
          aria-disabled={equal}
          className={`inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-[var(--radius-control,1rem)] border px-4 font-semibold ${text.label} bg-[color:var(--color-glass-flat,rgba(255,255,255,0.04))] hover:bg-[rgba(255,255,255,0.08)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50`}
          style={{ borderColor: color.controlBorder, color: color.fg }}
        >
          <RotateCcw size={20} strokeWidth={1.75} aria-hidden="true" />
          Reset to equal
        </button>
      </div>
    </GlassCard>
  )
}
