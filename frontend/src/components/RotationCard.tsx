import { useId } from 'react'
import {
  CircleCheck,
  FileSearch,
  Lightbulb,
  SearchX,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  UserSearch,
  type LucideIcon,
} from 'lucide-react'
import type { Confidence, RotationScore } from '../types/api'
import EvidencePanel from './EvidencePanel'
import { Badge, Card } from '../lib/ui4/primitives'
import { cx, fg, surface, tabular, type } from '../lib/ui4/cls'

export interface RotationCardProps {
  rotation: RotationScore
  className?: string
}

const CONFIDENCE: Record<Confidence, { tone: 'accent' | 'warn' | 'danger'; icon: LucideIcon }> = {
  HIGH: { tone: 'accent', icon: ShieldCheck },
  MEDIUM: { tone: 'warn', icon: Shield },
  LOW: { tone: 'danger', icon: ShieldAlert },
}

interface Section {
  key: 'why' | 'benefits' | 'risks' | 'data_gaps' | 'needs_local_review'
  title: string
  icon: LucideIcon
  iconClass: string
}

const SECTIONS: Section[] = [
  { key: 'why', title: 'Why this score', icon: Lightbulb, iconClass: fg.accent },
  { key: 'benefits', title: 'Benefits', icon: CircleCheck, iconClass: fg.accent },
  { key: 'risks', title: 'Risks', icon: TriangleAlert, iconClass: fg.danger },
  { key: 'data_gaps', title: 'Data gaps', icon: SearchX, iconClass: fg.demo },
  { key: 'needs_local_review', title: 'Needs local review', icon: UserSearch, iconClass: fg.derived },
]

function ListSection({ section, items }: { section: Section; items: string[] }) {
  const headingId = useId()
  const Icon = section.icon
  return (
    <section aria-labelledby={headingId} className={cx(surface.flat, 'flex min-w-0 flex-col gap-2 p-4')}>
      <h4 id={headingId} className={cx('flex items-center gap-2 font-semibold', type.body)}>
        <Icon size={20} aria-hidden="true" className={section.iconClass} />
        {section.title}
        <span className={cx(type.label, 'font-normal', fg.fg3, tabular)}>({items.length})</span>
      </h4>
      {items.length === 0 ? (
        <p className={cx(type.label, 'font-normal', fg.fg3)}>None reported</p>
      ) : (
        <ul className={cx('flex list-disc flex-col gap-1 pl-5', type.label, 'font-normal', fg.fg2)}>
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function RotationCard({ rotation, className }: RotationCardProps) {
  const titleId = useId()
  const evidenceId = useId()
  const conf = CONFIDENCE[rotation.confidence] ?? CONFIDENCE.LOW
  return (
    <div data-component="RotationCard" className={className}>
      <Card title={rotation.label} titleId={titleId}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">#{rotation.rank}</Badge>
          <Badge tone={conf.tone} icon={conf.icon} title="Confidence in this score">
            {rotation.confidence}
          </Badge>
          {rotation.is_existing && <Badge tone="neutral">existing</Badge>}
          <span className={cx(type.label, fg.fg2, tabular)}>
            Overall <span className={cx('font-semibold', fg.fg)}>{rotation.overall.toFixed(1)}</span>{' '}
            (range {rotation.overall_low.toFixed(1)} to {rotation.overall_high.toFixed(1)})
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {SECTIONS.map((s) => (
            <ListSection key={s.key} section={s} items={rotation[s.key] ?? []} />
          ))}
        </div>
        <section aria-labelledby={evidenceId} className="flex flex-col gap-2">
          <h4 id={evidenceId} className={cx('flex items-center gap-2 font-semibold', type.body)}>
            <FileSearch size={20} aria-hidden="true" className={fg.fg2} />
            Evidence
          </h4>
          <EvidencePanel items={rotation.evidence ?? []} />
        </section>
      </Card>
    </div>
  )
}
