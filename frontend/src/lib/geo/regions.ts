import type { FieldInfo } from '../../types/api'

/**
 * Display names for pilot regions. The frozen contract only carries `region_id`, so names live
 * here until M3 adds a regions list to the data. Unknown ids fall back to the id itself.
 */
const PUNJAB = {
  name: 'Punjab, Pakistan',
  aliases: ['punjab', 'pakistan', 'pk', 'multan', 'faisalabad', 'sargodha', 'rahim yar khan', 'south asia'],
}
const MIDWEST = {
  name: 'US Midwest',
  aliases: ['us', 'usa', 'united states', 'midwest', 'iowa', 'illinois', 'nebraska', 'kansas', 'corn belt'],
}

// pk_punjab / us_midwest are the ids in M3's data/fields.json; R1 / R2 are the old mock ids.
const REGION_META: Record<string, { name: string; aliases: string[] }> = {
  pk_punjab: PUNJAB,
  us_midwest: MIDWEST,
  R1: PUNJAB,
  R2: MIDWEST,
}

export interface RegionSummary {
  region_id: string
  name: string
  aliases: string[]
  fields: FieldInfo[]
}

export function regionName(regionId: string): string {
  return REGION_META[regionId]?.name ?? regionId
}

export function summarizeRegions(fields: FieldInfo[]): RegionSummary[] {
  const byId = new Map<string, FieldInfo[]>()
  for (const f of fields) byId.set(f.region_id, [...(byId.get(f.region_id) ?? []), f])
  return [...byId.entries()].map(([region_id, list]) => ({
    region_id,
    name: regionName(region_id),
    aliases: REGION_META[region_id]?.aliases ?? [],
    fields: list,
  }))
}
