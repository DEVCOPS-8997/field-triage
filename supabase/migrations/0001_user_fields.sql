-- Field Shift Advisor: each signed-in user's own fields.
-- Run once in the Supabase dashboard (SQL Editor) or with `supabase db push`.
--
-- * Accounts come from Supabase Auth (auth.users); the display name is user metadata `full_name`.
-- * Row Level Security: a user can only read, add, change or delete rows where user_id = auth.uid().
-- * Area and perimeter are computed here by PostGIS on the WGS84 spheroid (geography type), so the
--   stored numbers cannot be faked by the browser. Circles are stored as their centre + radius and
--   a 64-point outline for display; their area uses pi * r^2 exactly.

create extension if not exists postgis with schema extensions;

create table if not exists public.fields (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  address       text check (address is null or char_length(address) <= 300),
  shape_type    text not null check (shape_type in ('polygon', 'rectangle', 'circle')),
  geojson       jsonb not null,                       -- GeoJSON Polygon, [lon, lat] order
  radius_m      double precision check (radius_m is null or radius_m between 1 and 4000),
  geom          extensions.geography (Polygon, 4326),  -- set by trigger from geojson
  center_lat    double precision,
  center_lon    double precision,
  area_m2       double precision,
  perimeter_m   double precision,
  irrigation    text not null default 'none' check (irrigation in ('none', 'limited', 'reliable')),
  current_rotation_id text check (current_rotation_id is null or char_length(current_rotation_id) <= 80),
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists fields_user_id_idx on public.fields (user_id);
create index if not exists fields_geom_idx on public.fields using gist (geom);

-- Validate the outline and compute centre, area and perimeter on the server.
create or replace function public.fields_measure()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  g geometry;
begin
  if new.geojson is null or new.geojson ->> 'type' <> 'Polygon' then
    raise exception 'The field outline must be a polygon.' using errcode = '22023';
  end if;
  g := ST_SetSRID(ST_GeomFromGeoJSON(new.geojson::text), 4326);
  if ST_NPoints(g) < 4 then
    raise exception 'A field outline needs at least 3 corner points.' using errcode = '22023';
  end if;
  if not ST_IsValid(g) then
    raise exception 'The outline crosses itself. Redraw it so the edges do not cross.' using errcode = '22023';
  end if;

  new.geom := g::geography;
  new.center_lat := ST_Y(ST_Centroid(g));
  new.center_lon := ST_X(ST_Centroid(g));
  if new.shape_type = 'circle' then
    if new.radius_m is null then
      raise exception 'A circle needs a radius.' using errcode = '22023';
    end if;
    new.area_m2 := pi() * new.radius_m ^ 2;
    new.perimeter_m := 2 * pi() * new.radius_m;
  else
    new.radius_m := null;
    new.area_m2 := ST_Area(new.geom);          -- square metres on the spheroid
    new.perimeter_m := ST_Perimeter(new.geom); -- metres on the spheroid
  end if;

  if new.area_m2 < 10 then
    raise exception 'The field is smaller than 10 square metres. Check the drawing.' using errcode = '22023';
  end if;
  if new.area_m2 > 50000000 then
    raise exception 'The field is larger than 5,000 hectares. Draw one field at a time.' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    if (select count(*) from public.fields f where f.user_id = new.user_id) >= 200 then
      raise exception 'You can save up to 200 fields.' using errcode = '22023';
    end if;
  else
    new.user_id := old.user_id;  -- a field can never be moved to another account
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fields_measure on public.fields;
create trigger fields_measure
  before insert or update on public.fields
  for each row execute function public.fields_measure();

-- Row Level Security: everyone sees and edits only their own fields.
alter table public.fields enable row level security;

drop policy if exists "Users read own fields" on public.fields;
create policy "Users read own fields" on public.fields
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users add own fields" on public.fields;
create policy "Users add own fields" on public.fields
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users change own fields" on public.fields;
create policy "Users change own fields" on public.fields
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "Users delete own fields" on public.fields;
create policy "Users delete own fields" on public.fields
  for delete to authenticated using (user_id = (select auth.uid()));

-- Anonymous visitors get no access at all.
revoke all on public.fields from anon;
grant select, insert, update, delete on public.fields to authenticated;
