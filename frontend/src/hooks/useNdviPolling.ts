import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { NdviStatus } from '../types/api'

const POLL_MS = 10_000
const GIVE_UP_MS = 20 * 60_000
const PENDING = new Set<NdviStatus['state']>(['running', 'not_started'])

export const isNdviPending = (s: NdviStatus | undefined) => !!s && PENDING.has(s.state)

/**
 * Polls GET /locations/ndvi every 10 s while the satellite greenness download runs, then calls
 * `onReady` once so the comparison re-runs with observed bare-soil months.
 * Stops on unmount, when the download finishes or fails, or after about 20 minutes.
 */
export function useNdviPolling(
  lat: number,
  lon: number,
  fromCompare: NdviStatus | undefined,
  onReady: () => void,
): { status: NdviStatus | undefined; polling: boolean } {
  const pendingFromCompare = isNdviPending(fromCompare)
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`
  const startedAt = useRef<Map<string, number>>(new Map())
  const firedFor = useRef<string | null>(null)

  const poll = useQuery({
    queryKey: ['location-ndvi', key],
    queryFn: async (): Promise<NdviStatus> => {
      const t0 = startedAt.current.get(key) ?? Date.now()
      startedAt.current.set(key, t0)
      const st = await api.locationNdvi(lat, lon)
      if (PENDING.has(st.state) && Date.now() - t0 > GIVE_UP_MS) {
        // Turn a stuck download into a plain "not available" so polling stops.
        return {
          ...st,
          state: 'failed',
          message: 'Satellite greenness is taking too long, so bare months come from crop calendars.',
        }
      }
      return st
    },
    enabled: pendingFromCompare,
    retry: false,
    refetchInterval: (q) => (q.state.status === 'error' ? false : isNdviPending(q.state.data) || !q.state.data ? POLL_MS : false),
    refetchIntervalInBackground: false,
    staleTime: 0,
  })

  const polled = pendingFromCompare ? poll.data : undefined
  useEffect(() => {
    if (polled?.state === 'ready' && firedFor.current !== key) {
      firedFor.current = key
      onReady()
    }
  }, [polled?.state, key, onReady])

  const status = polled ?? fromCompare
  return { status, polling: isNdviPending(status) && !poll.isError }
}
