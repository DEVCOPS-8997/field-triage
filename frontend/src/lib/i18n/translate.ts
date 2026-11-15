import { Fragment, createElement, type ReactNode } from 'react'
import en from './en'
import ur from './ur'
import type { Dir, Lang, PluralKey, TranslationKey, Vars } from './types'

export const LANGS: readonly Lang[] = ['en', 'ur']
export const DEFAULT_LANG: Lang = 'en'
export const STORAGE_KEY = 'fsa.lang'

const DICTS: Record<Lang, unknown> = { en, ur }

export const dirOf = (lang: Lang): Dir => (lang === 'ur' ? 'rtl' : 'ltr')
export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'ur'

function lookup(dict: unknown, key: string): string | undefined {
  let node: unknown = dict
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

const warned = new Set<string>()
function warnMissing(lang: Lang, key: string) {
  if (!import.meta.env.DEV) return
  const id = `${lang}:${key}`
  if (warned.has(id)) return
  warned.add(id)
  console.warn(`[i18n] Missing "${lang}" translation for "${key}"; using English.`)
}

/** Raw template for a key: current language, then English, then the key itself. */
export function template(lang: Lang, key: string): string {
  const hit = lookup(DICTS[lang], key)
  if (hit !== undefined) return hit
  if (lang !== 'en') warnMissing(lang, key)
  const fallback = lookup(DICTS.en, key)
  if (fallback !== undefined) return fallback
  warnMissing('en', key)
  return key
}

export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

export function translate(lang: Lang, key: TranslationKey, vars?: Vars): string {
  return interpolate(template(lang, key), vars)
}

export function translatePlural(lang: Lang, key: PluralKey, count: number, vars?: Vars): string {
  const form = count === 1 ? 'one' : 'other'
  return interpolate(template(lang, `${key}_${form}`), { count, ...vars })
}

/** Like translate(), but variables may be React nodes (links, <strong>, <Ltr>). */
export function translateRich(lang: Lang, key: TranslationKey, vars: Record<string, ReactNode>): ReactNode {
  const parts = template(lang, key).split(/(\{\w+\})/g)
  return createElement(
    Fragment,
    null,
    ...parts.map((part, i) => {
      const m = /^\{(\w+)\}$/.exec(part)
      const value = m && m[1] in vars ? vars[m[1]] : part
      return createElement(Fragment, { key: i }, value)
    }),
  )
}

/** True when the key exists in English (use for data-driven keys such as crop ids). */
export function hasKey(key: string): boolean {
  return lookup(DICTS.en, key) !== undefined
}
