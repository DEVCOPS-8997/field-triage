// i18n: dependency-free English / Urdu support.
//   import { useI18n } from '../lib/i18n'
//   const { t, tn, rich, lang, dir, setLang, formatNumber } = useI18n()
export { LanguageProvider } from './LanguageProvider'
export { useI18n } from './useI18n'
export type { I18nValue } from './context'
export { formatNumber, formatPercent, formatDate } from './format'
export { translate, translatePlural, hasKey, dirOf, LANGS, STORAGE_KEY } from './translate'
export type { Lang, Dir, TranslationKey, PluralKey, Vars } from './types'
