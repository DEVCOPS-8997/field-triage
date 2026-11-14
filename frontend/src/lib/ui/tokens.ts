// Phase 3 local token helpers. Each value references the UI-SPEC CSS variable
// with its spec value as fallback, so it renders before Phase 2 adds the tokens.
// Phase 2 consolidates these into src/components/ui/.

export type Tone = 'accent' | 'water' | 'soil' | 'resilience' | 'income'
export type ComponentKey = 'water' | 'soil' | 'income' | 'resilience'

export const toneColor: Record<Tone, string> = {
  accent: 'var(--color-accent, #4ade80)',
  water: 'var(--color-water, #38bdf8)',
  soil: 'var(--color-soil, #e9965f)',
  resilience: 'var(--color-resilience, #2dd4bf)',
  income: 'var(--color-income, #bef264)',
}

export const color = {
  fg: 'var(--color-fg, #ecfdf3)',
  fg2: 'var(--color-fg-2, #b4cfc0)',
  fg3: 'var(--color-fg-3, #9bbba8)',
  accent: 'var(--color-accent, #4ade80)',
  lime: 'var(--color-lime, #bef264)',
  demo: 'var(--color-demo, #fbbf24)',
  danger: 'var(--color-danger, #fda4af)',
  derived: 'var(--color-derived, #c4b5fd)',
  existing: 'var(--color-existing, #e7f5ec)',
  controlBorder: 'var(--color-control-border, rgba(190, 242, 220, 0.45))',
  glassBorder: 'var(--color-glass-border, rgba(190, 242, 220, 0.16))',
  glassFlat: 'var(--color-glass-flat, rgba(255, 255, 255, 0.04))',
}

/** Display labels for the four score components (sentence case). */
export const componentLabel: Record<ComponentKey, string> = {
  water: 'Water',
  soil: 'Soil health',
  income: 'Income',
  resilience: 'Resilience',
}

// Typography: exactly the four spec sizes (arbitrary values with fallbacks).
export const text = {
  label: 'text-[length:var(--text-label,0.875rem)] leading-[1.4]',
  body: 'text-[length:var(--text-body,1rem)] leading-[1.5]',
  heading:
    'text-[length:var(--text-heading,1.5rem)] leading-[1.2] font-semibold font-[family-name:var(--font-display,Fraunces,Georgia,serif)]',
  display:
    'text-[length:var(--text-display,2.5rem)] leading-[1.2] font-semibold font-[family-name:var(--font-display,Fraunces,Georgia,serif)]',
}

export const fgClass = {
  fg: 'text-[color:var(--color-fg,#ecfdf3)]',
  fg2: 'text-[color:var(--color-fg-2,#b4cfc0)]',
  fg3: 'text-[color:var(--color-fg-3,#9bbba8)]',
}

/** Clean number readout for a 0-100 score (one decimal, no trailing .0). */
export const fmtScore = (v: number) => (Math.round(v * 10) / 10).toString()
