import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadInputs, parseEquipParam, saveInputs, type FarmInputs } from '../store/farmInputs'

/**
 * Farmer inputs kept in localStorage (per browser) and, for equipment, in the `equip`
 * URL parameter so "Analyze" from My Fields can pre-fill it and the link stays shareable.
 */
export function useFarmInputs() {
  const [params, setParams] = useSearchParams()
  const [inputs, setInputs] = useState<FarmInputs>(() => {
    const stored = loadInputs()
    const fromUrl = parseEquipParam(params.get('equip'))
    return fromUrl ? { ...stored, noEquipment: fromUrl } : stored
  })

  useEffect(() => saveInputs(inputs), [inputs])

  // Mirror equipment into the URL only when the URL already carries it, or it is non-empty.
  const equipKey = [...inputs.noEquipment].sort().join(',')
  useEffect(() => {
    const cur = params.get('equip')
    if ((cur ?? '') === equipKey || (cur === null && equipKey === '')) return
    const next = new URLSearchParams(params)
    if (equipKey) next.set('equip', equipKey)
    else next.delete('equip')
    setParams(next, { replace: true })
  }, [equipKey, params, setParams])

  const update = useCallback(<K extends keyof FarmInputs>(key: K, value: FarmInputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }))
  }, [])

  return { inputs, update, setInputs }
}
