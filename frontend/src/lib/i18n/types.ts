import type en from './en'

export type Lang = 'en' | 'ur'
export type Dir = 'ltr' | 'rtl'

/** Shape every dictionary follows (string leaves, nested groups). */
export type Dictionary = typeof en

/** Urdu (and any later language) may leave keys out: missing keys fall back to English. */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> }

/** Widens literal string leaves so a translation can hold any text. */
export type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> }

type Join<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`

/** Every dotted leaf path of the English dictionary, e.g. "nav.overview". */
export type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? Join<P, K> : Paths<T[K], Join<P, K>>
}[keyof T & string]

export type TranslationKey = Paths<Dictionary>

/** Base keys that have `_one` / `_other` plural forms, e.g. "overview.fieldCount". */
export type PluralKey = TranslationKey extends infer K
  ? K extends `${infer B}_one`
    ? B
    : never
  : never

export type Vars = Record<string, string | number>
