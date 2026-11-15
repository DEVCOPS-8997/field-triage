import { cx, fg } from '../../lib/ui4/cls'

export const controlCls =
  'min-h-[44px] w-full min-w-0 rounded-[var(--radius-control,1rem)] border border-[color:var(--color-control-border,rgba(190,242,220,0.45))] bg-[rgba(0,0,0,0.25)] px-3 text-[color:var(--color-fg,#ecfdf3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent,#4ade80)]'

export const hintCls = cx('m-0 text-[13px] leading-snug', fg.fg3)
