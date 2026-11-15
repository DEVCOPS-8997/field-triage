import { createContext, type ReactNode } from 'react'
import type { Dir, Lang, PluralKey, TranslationKey, Vars } from './types'
import { DEFAULT_LANG, dirOf, translate, translatePlural, translateRich } from './translate'
import { formatNumber, formatDate, formatPercent } from './format'

export interface I18nValue {
  lang: Lang
  dir: Dir
  setLang: (lang: Lang) => void
  /** t('nav.overview'), t('overview.welcome', { name }) */
  t: (key: TranslationKey, vars?: Vars) => string
  /** Plural: tn('overview.fieldCount', 3) reads `fieldCount_one` / `fieldCount_other`; `{count}` is filled in. */
  tn: (key: PluralKey, count: number, vars?: Vars) => string
  /** Rich interpolation: variables may be React nodes. rich('searchPin.goTo', { id: <Ltr>F-01</Ltr> }) */
  rich: (key: TranslationKey, vars: Record<string, ReactNode>) => ReactNode
  /** Intl number formatting, always Western digits. */
  formatNumber: (value: number | null | undefined, opts?: Intl.NumberFormatOptions) => string
  formatPercent: (share: number | null | undefined, digits?: number) => string
  formatDate: (value: string | Date | null | undefined, missing?: string) => string
}

export function makeValue(lang: Lang, setLang: (lang: Lang) => void): I18nValue {
  return {
    lang,
    dir: dirOf(lang),
    setLang,
    t: (key, vars) => translate(lang, key, vars),
    tn: (key, count, vars) => translatePlural(lang, key, count, vars),
    rich: (key, vars) => translateRich(lang, key, vars),
    formatNumber: (value, opts) => formatNumber(value, opts, lang),
    formatPercent: (share, digits) => formatPercent(share, digits, lang),
    formatDate: (value, missing) => formatDate(value, lang, missing),
  }
}

/** Default (no provider): English, setLang is a no-op. Keeps components usable in isolation. */
export const I18nContext = createContext<I18nValue>(makeValue(DEFAULT_LANG, () => {}))
