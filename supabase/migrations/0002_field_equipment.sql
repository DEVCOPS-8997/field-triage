-- Field Shift Advisor: equipment, labour or commitments the farmer does NOT have, per field.
-- Run once after 0001 in the Supabase dashboard (SQL Editor) or with `supabase db push`.
--
-- * Values match the backend FarmConstraints.unavailable_equipment ids (frontend EquipmentId).
-- * Row Level Security from 0001 covers the whole row, so this column is private to the owner too.
--   No policy changes are needed; existing grants to `authenticated` include new columns.
-- * The app also mirrors the list into details->'unavailable_equipment', so fields saved before this
--   migration keep their choices; this column is the canonical copy once it exists.

alter table public.fields
  add column if not exists unavailable_equipment text[] not null default '{}';

alter table public.fields
  drop constraint if exists fields_unavailable_equipment_check;

alter table public.fields
  add constraint fields_unavailable_equipment_check
  check (
    unavailable_equipment <@ array[
      'seed_drill',
      'combine_harvester',
      'rice_transplanting',
      'picking_labour',
      'orchard_commitment',
      'daily_market_access'
    ]::text[]
  );

-- Backfill from the details mirror written by app versions that ran before this migration.
update public.fields
set unavailable_equipment = array(
  select distinct v
  from jsonb_array_elements_text(details -> 'unavailable_equipment') as v
  where v in ('seed_drill', 'combine_harvester', 'rice_transplanting', 'picking_labour', 'orchard_commitment', 'daily_market_access')
)
where jsonb_typeof(details -> 'unavailable_equipment') = 'array'
  and unavailable_equipment = '{}';

-- Make PostgREST see the new column straight away.
notify pgrst, 'reload schema';
