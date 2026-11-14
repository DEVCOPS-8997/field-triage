// Phase 4 local class tokens. They reference the 02-UI-SPEC CSS variables with
// hex fallbacks so the components render correctly before or after the Phase 2
// @theme lands. Phase 2 consolidation can swap these for the shared primitives.

export const type = {
  label: 'text-[14px] leading-[1.4]',
  body: 'text-[16px] leading-[1.5]',
  heading:
    'font-[family-name:var(--font-display,Georgia,serif)] text-[24px] leading-[1.2] font-semibold',
  display:
    'font-[family-name:var(--font-display,Georgia,serif)] text-[40px] leading-[1.2] font-semibold',
} as const

export const fg = {
  fg: 'text-[color:var(--color-fg,#ecfdf3)]',
  fg2: 'text-[color:var(--color-fg-2,#b4cfc0)]',
  fg3: 'text-[color:var(--color-fg-3,#9bbba8)]',
  accent: 'text-[color:var(--color-accent,#4ade80)]',
  demo: 'text-[color:var(--color-demo,#fbbf24)]',
  danger: 'text-[color:var(--color-danger,#fda4af)]',
  derived: 'text-[color:var(--color-derived,#c4b5fd)]',
} as const

export const surface = {
  glass:
    'bg-[color:var(--color-glass,rgba(16,48,32,0.7))] border border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] rounded-[var(--radius-card,1.5rem)] shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[12px] md:backdrop-blur-[20px] backdrop-saturate-[1.4]',
  flat:
    'bg-[color:var(--color-glass-flat,rgba(255,255,255,0.04))] border border-[color:var(--color-glass-border,rgba(190,242,220,0.16))] rounded-[var(--radius-control,1rem)]',
} as const

export const tabular = '[font-variant-numeric:tabular-nums]'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
