import type { ReactNode } from 'react'
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { Confidence } from '../../types/api'
import { color, text } from './tokens'

export type PillTone = 'neutral' | 'accent' | 'warn' | 'danger' | 'info' | 'existing'

const toneVar: Record<Exclude<PillTone, 'neutral'>, string> = {
  accent: color.accent,
  warn: color.demo,
  danger: color.danger,
  info: color.derived,
  existing: color.existing,
}

type Props = {
  tone?: PillTone
  icon?: ReactNode
  dashed?: boolean
  title?: string
  className?: string
  children: ReactNode
}

/** Spec Badge: 28px pill, Label 14/600, tone colour text + 14% tint fill. */
export function Pill({ tone = 'neutral', icon, dashed = false, title, className = '', children }: Props) {
  const style =
    tone === 'neutral'
      ? { color: color.fg2, background: color.glassFlat, borderColor: color.glassBorder }
      : {
          color: toneVar[tone],
          background: `color-mix(in srgb, ${toneVar[tone]} 14%, transparent)`,
          borderColor: `color-mix(in srgb, ${toneVar[tone]} 60%, transparent)`,
        }
  return (
    <span
      data-component="Pill"
      title={title}
      className={`inline-flex h-[28px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 font-semibold ${text.label} ${dashed ? 'border-dashed' : 'border-solid'} ${className}`}
      style={style}
    >
      {icon && (
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      )}
      {children}
    </span>
  )
}

const confidenceTone: Record<Confidence, PillTone> = { HIGH: 'accent', MEDIUM: 'warn', LOW: 'danger' }
const confidenceIcon: Record<Confidence, ReactNode> = {
  HIGH: <ShieldCheck size={16} strokeWidth={1.75} />,
  MEDIUM: <Shield size={16} strokeWidth={1.75} />,
  LOW: <ShieldAlert size={16} strokeWidth={1.75} />,
}

/** Confidence badge: HIGH accent / MEDIUM warn / LOW danger, text as data. */
export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  const known = confidence in confidenceTone
  return (
    <Pill
      tone={known ? confidenceTone[confidence] : 'neutral'}
      icon={known ? confidenceIcon[confidence] : <Shield size={16} strokeWidth={1.75} />}
      title={`Confidence: ${confidence}`}
    >
      <span className="sr-only">Confidence </span>
      {confidence}
    </Pill>
  )
}

export default Pill
