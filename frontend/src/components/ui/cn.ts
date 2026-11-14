/**
 * cn(...parts): joins truthy class-name parts with a space.
 * Tiny local helper so primitives need no extra dependency.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Tone keys shared by Slider and Gauge (score components + accent). */
export type ScoreTone = 'accent' | 'water' | 'soil' | 'resilience' | 'income'

/** CSS colour value for each tone (reads the @theme tokens). */
export const TONE_COLOR: Record<ScoreTone | 'simulated', string> = {
  accent: 'var(--color-accent)',
  water: 'var(--color-water)',
  soil: 'var(--color-soil)',
  resilience: 'var(--color-resilience)',
  income: 'var(--color-income)',
  simulated: 'var(--color-demo)',
}
