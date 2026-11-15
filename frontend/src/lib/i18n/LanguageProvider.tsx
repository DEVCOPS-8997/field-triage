import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, makeValue } from './context'
import { DEFAULT_LANG, STORAGE_KEY, dirOf, isLang } from './translate'
import type { Lang } from './types'

function readStored(): Lang {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (isLang(v)) return v
  } catch {
    /* storage blocked (private mode, sandbox): use the default */
  }
  return DEFAULT_LANG
}

function store(lang: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* storage blocked: the choice lasts for this page view only */
  }
}

/** Applies lang/dir to <html> so CSS (:lang(ur), [dir="rtl"]) and the browser's bidi layout follow. */
function applyToDocument(lang: Lang) {
  const root = document.documentElement
  root.lang = lang
  root.dir = dirOf(lang)
}

export function LanguageProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initial ?? readStored())

  useEffect(() => {
    applyToDocument(lang)
  }, [lang])

  // Keep several open tabs in step.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && isLang(e.newValue)) setLangState(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setLang = useCallback((next: Lang) => {
    store(next)
    setLangState(next)
  }, [])

  const value = useMemo(() => makeValue(lang, setLang), [lang, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export default LanguageProvider
