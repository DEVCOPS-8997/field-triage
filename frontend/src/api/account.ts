import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/useAuth'
import { circleRing, sidesM, type LonLat } from '../lib/geo/measure'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type ShapeType = 'polygon' | 'rectangle' | 'circle'
export interface ShapeIn {
  type: ShapeType
  coordinates?: LonLat[] // [lon, lat], open ring
  center?: LonLat
  radius_m?: number
}

export interface FieldDetailsIn {
  soil_type?: string | null
  water_source?: string | null
  main_goal?: string | null
  equipment?: string | null
  market?: string | null
  notes?: string | null
}

export interface MyFieldIn {
  name: string
  address?: string | null
  shape: ShapeIn
  irrigation: 'none' | 'limited' | 'reliable'
  current_rotation_id?: string | null
  details: FieldDetailsIn
}

interface FieldRow {
  id: number
  name: string
  address: string | null
  shape_type: ShapeType
  geojson: { type: 'Polygon'; coordinates: LonLat[][] }
  radius_m: number | null
  center_lat: number
  center_lon: number
  area_m2: number
  perimeter_m: number
  irrigation: 'none' | 'limited' | 'reliable'
  current_rotation_id: string | null
  details: FieldDetailsIn
  created_at: string
  updated_at: string
}

export interface MyField extends FieldRow {
  center: { lat: number; lon: number }
  area_ha: number
  area_acres: number
  sides_m: number[]
  shape: ShapeIn
}

export interface GeocodeHit {
  label: string
  lat: number
  lon: number
}

const COLUMNS =
  'id,name,address,shape_type,geojson,radius_m,center_lat,center_lon,area_m2,perimeter_m,irrigation,current_rotation_id,details,created_at,updated_at'

function openRing(f: FieldRow): LonLat[] {
  const ring = f.geojson.coordinates[0] ?? []
  return ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
}

function fromRow(f: FieldRow): MyField {
  const ring = openRing(f)
  const shape: ShapeIn =
    f.shape_type === 'circle' && f.radius_m
      ? { type: 'circle', center: [f.center_lon, f.center_lat], radius_m: f.radius_m }
      : { type: f.shape_type, coordinates: ring }
  return {
    ...f,
    center: { lat: f.center_lat, lon: f.center_lon },
    area_ha: f.area_m2 / 10_000,
    area_acres: f.area_m2 / 4046.8564224,
    sides_m: f.shape_type === 'circle' ? [] : sidesM(ring),
    shape,
  }
}

function toRow(body: MyFieldIn) {
  const s = body.shape
  const ring: LonLat[] = s.type === 'circle' && s.center && s.radius_m ? circleRing(s.center, s.radius_m) : (s.coordinates ?? [])
  return {
    name: body.name.trim(),
    address: body.address?.trim() || null,
    shape_type: s.type,
    geojson: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
    radius_m: s.type === 'circle' ? s.radius_m : null,
    irrigation: body.irrigation,
    current_rotation_id: body.current_rotation_id || null,
    details: body.details,
  }
}

function need() {
  if (!supabase) throw new Error('Accounts are not set up on this server (Supabase keys missing).')
  return supabase
}

/** Turn database errors into the plain message raised by the trigger, or a short generic one. */
function plain(err: { message?: string; code?: string } | null): Error {
  return new Error(err?.message || 'Something went wrong. Try again.')
}

export const accountApi = {
  signup: async (name: string, email: string, password: string) => {
    const { data, error } = await need().auth.signUp({ email, password, options: { data: { full_name: name } } })
    if (error) throw plain(error)
    return { needsConfirmation: !data.session }
  },
  login: async (email: string, password: string) => {
    const { error } = await need().auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email or password is not correct.' : error.message)
  },
  logout: async () => {
    await supabase?.auth.signOut()
  },
  // Address search goes through our backend (OpenStreetMap Nominatim, rate-limited, generic client name).
  geocode: async (q: string): Promise<GeocodeHit[]> => {
    const res = await fetch(`${API_URL}/api/v1/geocode?q=${encodeURIComponent(q)}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(typeof body?.detail === 'string' ? body.detail : 'Address search failed.')
    }
    return res.json()
  },
}

export function useMyFields() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['my-fields', userId],
    enabled: !!userId && !!supabase,
    queryFn: async () => {
      const { data, error } = await need().from('fields').select(COLUMNS).order('updated_at', { ascending: false })
      if (error) throw plain(error)
      return (data as FieldRow[]).map(fromRow)
    },
  })
}

export function useMyField(id: number | null) {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['my-field', userId, id],
    enabled: !!userId && id !== null && !!supabase,
    queryFn: async () => {
      const { data, error } = await need().from('fields').select(COLUMNS).eq('id', id!).maybeSingle()
      if (error) throw plain(error)
      if (!data) throw new Error('Field not found.')
      return fromRow(data as FieldRow)
    },
  })
}

export function useSaveField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: number | null; body: MyFieldIn }) => {
      const row = toRow(body)
      const q = id === null ? need().from('fields').insert(row) : need().from('fields').update(row).eq('id', id)
      const { data, error } = await q.select(COLUMNS).single()
      if (error) throw plain(error)
      return fromRow(data as FieldRow)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-fields'] })
      void qc.invalidateQueries({ queryKey: ['my-field'] })
    },
  })
}

export function useDeleteField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await need().from('fields').delete().eq('id', id)
      if (error) throw plain(error)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-fields'] }),
  })
}
