import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import { useAppStore } from '../store/useAppStore'

export const useFields = () =>
  useQuery({ queryKey: ['fields'], queryFn: api.fields })

export const useProfile = (fieldId: string | undefined) =>
  useQuery({
    queryKey: ['profile', fieldId],
    queryFn: () => api.profile(fieldId!),
    enabled: !!fieldId,
  })

// Settle slider drags before querying, so the backend gets one POST per pause, not one per step.
function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// Re-runs whenever the sliders change (priorities / scenario live in the store).
export const useCompare = (fieldId: string | undefined) => {
  const priorities = useDebounced(useAppStore((s) => s.priorities))
  const scenario = useDebounced(useAppStore((s) => s.scenario))
  return useQuery({
    queryKey: ['compare', fieldId, priorities, scenario],
    queryFn: () => api.compare({ field_id: fieldId!, priorities, scenario }),
    enabled: !!fieldId,
    placeholderData: (prev) => prev,
  })
}
