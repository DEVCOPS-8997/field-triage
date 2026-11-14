// Phase 5 class-name primitives. They reference the UI-SPEC CSS variables with
// literal fallbacks, so they render correctly before and after the Phase 2
// tokens land in src/index.css. Spacing steps stay on 1/2/4/6/8/12/16.

export const tx = {
  label: 'text-[length:var(--text-label,0.875rem)] leading-[1.4]',
  body: 'text-[length:var(--text-body,1rem)] leading-[1.5]',
  heading:
    'text-[length:var(--text-heading,1.5rem)] leading-[1.2] font-semibold font-[family-name:var(--font-display,Georgia,serif)]',
  display:
    'text-[length:var(--text-display,2.5rem)] leading-[1.2] font-semibold font-[family-name:var(--font-display,Georgia,serif)]',
  fg: 'text-[color:var(--color-fg,#ecfdf3)]',
  fg2: 'text-[color:var(--color-fg-2,#b4cfc0)]',
  fg3: 'text-[color:var(--color-fg-3,#9bbba8)]',
  accent: 'text-[color:var(--color-accent,#4ade80)]',
  num: '[font-variant-numeric:tabular-nums]',
} as const

export const surface = {
  glass:
    'rounded-[var(--radius-card,1.5rem)] border border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] bg-[var(--color-glass,rgba(16,48,32,0.7))] shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-[20px]',
  strong:
    'border border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] bg-[var(--color-glass-strong,rgba(8,28,18,0.82))] backdrop-blur-[16px]',
  flat: 'border border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] bg-[var(--color-glass-flat,rgba(255,255,255,0.04))]',
  radiusControl: 'rounded-[var(--radius-control,1rem)]',
  radiusChip: 'rounded-[var(--radius-chip,0.75rem)]',
} as const

/** Badge tones from the UI-SPEC (pill, 28px, Label 14/600, 14% tint). */
export const badgeTone = {
  neutral:
    'border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] bg-[var(--color-glass-flat,rgba(255,255,255,0.04))] text-[color:var(--color-fg-2,#b4cfc0)]',
  accent:
    'border-[color:var(--color-accent,#4ade80)] bg-[rgba(74,222,128,0.14)] text-[color:var(--color-accent,#4ade80)]',
  warn: 'border-[color:var(--color-demo,#fbbf24)] bg-[rgba(251,191,36,0.14)] text-[color:var(--color-demo,#fbbf24)]',
  danger:
    'border-[color:var(--color-danger,#fda4af)] bg-[rgba(253,164,175,0.14)] text-[color:var(--color-danger,#fda4af)]',
  info: 'border-[color:var(--color-derived,#c4b5fd)] bg-transparent text-[color:var(--color-derived,#c4b5fd)]',
} as const

export type BadgeTone = keyof typeof badgeTone

export const badgeBase = `inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-solid px-2 font-semibold ${tx.label}`

export const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ')
