import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Supabase client for accounts and saved fields. The anon key is public by design; every table is
 * protected by Row Level Security (see supabase/migrations). Null when the env vars are not set,
 * in which case account features show a "not configured" message and the rest of the app works.
 */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null
export const accountsEnabled = supabase !== null
