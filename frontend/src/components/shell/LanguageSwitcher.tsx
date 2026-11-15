/**
 * LanguageSwitcher: "EN | اردو" segmented toggle (radio group) for the app shell.
 * Switches instantly (no reload); the choice is saved by LanguageProvider.
 *
 * - role="radiogroup" with a bilingual label, roving tabindex, Arrow keys / Home / End.
 * - The pill keeps the same visual order in both languages (dir="ltr" on the group) so it never
 *   jumps under the pointer when the page mirrors.
 * - Each option carries its own `lang` so screen readers pronounce it correctly.
 *
 * Props
 * - orientation?: 'horizontal' | 'vertical'   vertical for the 80px icon rail
 * - size?: 'md' | 'sm'                        sm for the 56px phone header
 * - className?: string
 */
import { useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { useI18n, type Lang } from '../../lib/i18n'
import { cn } from '../ui/cn'

const OPTIONS: Array<{ value: Lang; short: string; name: string; style?: CSSProperties }> = [
  { value: 'en', short: 'EN', name: 'English' },
  {
    value: 'ur',
    short: 'اردو',
    name: 'اردو',
    // Naskh even in English mode, so the Urdu label always renders in a proper Urdu face.
    style: { fontFamily: '"Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif', letterSpacing: 0 },
  },
]

export interface LanguageSwitcherProps {
  orientation?: 'horizontal' | 'vertical'
  size?: 'md' | 'sm'
  className?: string
}

export function LanguageSwitcher({ orientation = 'horizontal', size = 'md', className }: LanguageSwitcherProps) {
  const { lang, setLang, t } = useI18n()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const current = Math.max(0, OPTIONS.findIndex((o) => o.value === lang))

  const select = (idx: number) => {
    const n = OPTIONS.length
    const next = ((idx % n) + n) % n
    setLang(OPTIONS[next].value)
    refs.current[next]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        select(current + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        select(current - 1)
        break
      case 'Home':
        e.preventDefault()
        select(0)
        break
      case 'End':
        e.preventDefault()
        select(OPTIONS.length - 1)
        break
    }
  }

  const vertical = orientation === 'vertical'

  return (
    <div
      data-component="LanguageSwitcher"
      role="radiogroup"
      aria-label={t('lang.groupLabel')}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      dir="ltr"
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex shrink-0 items-stretch gap-[2px] rounded-full border border-control-border bg-[rgba(0,0,0,0.22)] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        vertical ? 'flex-col' : 'flex-row',
        className,
      )}
    >
      {OPTIONS.map((o, i) => {
        const checked = o.value === lang
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            lang={o.value}
            aria-checked={checked}
            aria-label={o.name}
            tabIndex={checked ? 0 : -1}
            onClick={() => select(i)}
            style={o.style}
            className={cn(
              'flex items-center justify-center rounded-full font-semibold leading-none transition-colors duration-150',
              'focus-visible:outline-offset-1',
              size === 'sm' ? 'h-[32px]' : 'h-[36px]',
              vertical ? 'w-[52px] px-0' : size === 'sm' ? 'min-w-[44px] px-2' : 'min-w-[52px] px-3',
              // Urdu label: a little larger and lifted, Naskh sits low in the line box.
              o.value === 'ur'
                ? size === 'sm' ? 'pb-[3px] text-[15px]' : 'pb-[3px] text-[16px]'
                : size === 'sm' ? 'text-[13px]' : 'text-[14px]',
              checked
                ? 'bg-accent text-accent-ink shadow-[0_0_14px_rgba(74,222,128,0.35)]'
                : 'text-fg-2 hover:bg-glass-flat hover:text-fg',
            )}
          >
            {o.short}
          </button>
        )
      })}
    </div>
  )
}

export default LanguageSwitcher
