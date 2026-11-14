import { useEffect } from 'react'
import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface AuthUser {
  id: string
  email: string
  name: string
}

interface AuthState {
  ready: boolean
  user: AuthUser | null
  setSession: (s: Session | null) => void
}

const toUser = (s: Session | null): AuthUser | null =>
  s?.user
    ? {
        id: s.user.id,
        email: s.user.email ?? '',
        name: (s.user.user_metadata?.full_name as string | undefined) || (s.user.email ?? '').split('@')[0],
      }
    : null

/** Current Supabase Auth user (session persistence and refresh are handled by supabase-js). */
export const useAuth = create<AuthState>((set) => ({
  ready: !supabase,
  user: null,
  setSession: (s) => set({ user: toUser(s), ready: true }),
}))

/** Mount once (in App) to keep the store in sync with Supabase Auth. */
export function useAuthListener() {
  const setSession = useAuth((s) => s.setSession)
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => data.subscription.unsubscribe()
  }, [setSession])
}
