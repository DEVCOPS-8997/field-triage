import { useContext } from 'react'
import { I18nContext, type I18nValue } from './context'

/** const { t, lang, dir, setLang } = useI18n() */
export function useI18n(): I18nValue {
  return useContext(I18nContext)
}
