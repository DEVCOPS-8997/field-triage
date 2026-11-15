// Plain-language definitions for the science words shown in results (challenge point 13).
// Each entry: what it is (one sentence) + why it matters for the farmer (one sentence).
// English only for now; the i18n sweep can wrap `what` / `why`.

export type GlossaryId =
  | 'eto'
  | 'ndvi'
  | 'rootzone'
  | 'soil_moisture_anomaly'
  | 'water_balance'
  | 'effective_rain'
  | 'heat_days'
  | 'frost_risk'
  | 'living_roots'
  | 'erosion_risk'
  | 'grid_cell'
  | 'percentile_range'

export interface GlossaryEntry {
  /** Short name shown as the popover heading. */
  term: string
  what: string
  why: string
}

export const GLOSSARY: Record<GlossaryId, GlossaryEntry> = {
  eto: {
    term: 'Evapotranspiration (ETo)',
    what: 'The water that sun, heat and wind pull out of the soil and out of a short green crop each day, measured in millimetres like rain.',
    why: 'When this number is bigger than your rain, the crop is drinking more than the sky gives, so it needs stored soil water or irrigation.',
  },
  ndvi: {
    term: 'NDVI (greenness)',
    what: 'A satellite score from 0 to 1 that shows how green and leafy the land is; bare soil is near 0.1 and a thick healthy crop is above 0.6.',
    why: 'It shows when your land is covered by a crop and when it lies bare, which is when soil and water are most easily lost.',
  },
  rootzone: {
    term: 'Root-zone wetness',
    what: 'How wet the soil is in the top metre where roots live, from 0% (bone dry) to 100% (full of water), estimated by NASA models (GWETROOT, or SMAP soil moisture).',
    why: 'Wet soil at sowing time means the seed can sprout and the crop can survive a dry spell without extra watering.',
  },
  soil_moisture_anomaly: {
    term: 'Soil moisture anomaly',
    what: 'How much wetter or drier the soil is right now compared with the usual for this time of year.',
    why: 'A strongly negative value warns of drought stress early, before the crop shows it, so you can plan watering or delay sowing.',
  },
  water_balance: {
    term: 'Water balance',
    what: 'A simple account of water: what the crop needs in a season against what rain, stored soil water and your irrigation provide.',
    why: 'The part left over as "shortfall" is the water you would have to find, or the yield you may lose if you cannot.',
  },
  effective_rain: {
    term: 'Effective rain',
    what: 'The part of the rain that actually soaks into the soil where roots can use it; the rest runs off or dries away.',
    why: 'Heavy downpours look large in rain totals but much of it is lost, so effective rain is the fairer number for planning.',
  },
  heat_days: {
    term: 'Heat days',
    what: 'Days when the highest temperature reaches a level that harms a crop, for example 35 °C or more for wheat at flowering.',
    why: 'A few hot days at flowering can shrivel grain and cut yield, so crops and sowing dates should avoid the hottest weeks.',
  },
  frost_risk: {
    term: 'Frost risk',
    what: 'The share of past years that had at least one night at or below 0 °C in that month.',
    why: 'Frost can kill young or flowering plants overnight, so sensitive crops should not be in the field in high-risk months.',
  },
  living_roots: {
    term: 'Living roots',
    what: 'The share of months in the year when some crop or cover crop is growing in the field, so live roots hold the soil.',
    why: 'More months with living roots means less soil washed or blown away and more organic matter feeding the soil.',
  },
  erosion_risk: {
    term: 'Erosion risk',
    what: 'The chance that rain or wind carries away your top soil, which is highest when the soil is bare, the land slopes and heavy rain falls.',
    why: 'Top soil holds most of the nutrients; losing it lowers yields for years, and a cover crop or ridges across the slope can prevent it.',
  },
  grid_cell: {
    term: 'Satellite grid cell',
    what: 'Satellites and climate models split the land into squares; each square gets one value, and a NASA POWER square is about 50 km wide.',
    why: 'Your field is one small spot inside that square, so local hills, canals or shade can make your field differ from the number shown.',
  },
  percentile_range: {
    term: 'Range (10th to 90th percentile)',
    what: 'The band that covers 8 out of 10 past years: only 1 year in 10 was below the low end and 1 in 10 above the high end.',
    why: 'It shows the realistic good and bad years to plan for, not just the average year, which rarely happens exactly.',
  },
}
