# Field Shift: Execution Plan (10-hour build, 4 members)

Working name: **Field Shift Advisor**. A rotation comparison tool driven by NASA Earth observations.
Built on the ChatGPT "Field Triage" blueprint (its module split, shared contract and mock-first idea are good). Changes below are marked **[CHANGE]**.

---

## 0. Read this first: what changes versus the ChatGPT blueprint

1. **[CHANGE] The core product is rotation comparison, not flood recovery.** The blueprint solves post-flood recovery (RESUME / DELAY / SWITCH / REPAIR) and adds rotation as a "second stage". Field Shift judges you on comparing at least 3 rotation strategies (including the existing one), with why, evidence, benefits, data gaps and risks. Rotation is stage 1. The old triage becomes a small optional "Right now" card.
2. **[CHANGE] 30 days of weather cannot support a rotation decision.** Rotation is a multi-season choice. Add a 10 to 20 year climate baseline per field (POWER), plus SMAP (2015 onward) and MODIS NDVI history.
3. **[CHANGE] Precompute, then serve.** A pipeline script pulls NASA data once and saves it as files. The API reads those files. The demo never depends on live NASA calls.
4. **[CHANGE] SMAP granule download is too slow for history.** SPL4SMGP is 3-hourly global granules. Ten years of them cannot be downloaded in 10 hours. Use Google Earth Engine point extraction (fallback: AppEEARS). Use granule download only for a single "latest" demo value.
5. **[CHANGE] Window is 10 hours, not 24.** Checkpoints are compressed (section 9).
6. **[CHANGE] Roles renumbered so Member 4 is the React frontend** (the blueprint had frontend as Person 3).
7. **Code fix in the blueprint's `power.py`:** it drops invalid values and then slices the last 7, which silently shifts the date window. Keep a dated series (pandas), mask `-999` as NaN, then slice by date.
8. **Keep from the blueprint:** null means "no observation" (never zero), `data_quality` and `data_sources` on every response, `data_mode: demo|observed` labelling, thresholds in a JSON file not hardcoded, frozen schemas before coding.

---

## 1. Field Shift requirement coverage

| Field Shift requirement | Where it is satisfied | Owner |
|---|---|---|
| Use NASA Earth observations | POWER, SMAP L4, MODIS MOD13Q1 (core); IMERG, SRTM (stretch) | M1 |
| Local soil information | SoilGrids per field (clay, sand, SOC, pH) plus `soil_type` farmer input | M1 + M3 |
| Crop characteristics | `crops.json` | M3 |
| Farmer priorities | Priority sliders `w_water, w_soil, w_income, w_resilience` | M4 + M2 |
| Compare at least 3 rotations incl. existing | `rotations.json`: existing, water_saving, soil_building (+ income) | M3 + M2 |
| Why suggested / evidence / benefits / gaps / risks | `RotationScore.why, evidence, benefits, data_gaps, risks` | M2 |
| Highlight bare-field periods, vulnerable seasons | `bare_days_est`, monthly NDVI curve, season viability | M1 + M2 |
| Uncertainty, where local expertise is needed | `overall_low/high`, `confidence`, `needs_local_review` | M2 |
| Maps and visualization | Leaflet field map, NDVI/rain/soil-moisture charts | M4 |
| Scenario sliders (rain, temperature) | `Scenario` in compare request | M2 + M4 |
| Supports, not replaces, farmers | Disclaimer component plus Limitations page | M3 + M4 |
| International worth | Two contrasting pilot regions, global datasets only in the core | M3 |

---

## 2. Architecture and data flow

```
pipeline/ (run once, offline)                 backend/ (FastAPI, serves files)              frontend/ (React)
  extract_power.py    -> raw/power_daily.parquet
  extract_smap.py     -> raw/smap_daily.parquet
  extract_modis.py    -> raw/modis_ndvi.parquet     build_profiles.py
  extract_terrain.py  -> raw/terrain.json           (raw -> profile.json)
  extract_soil.py     -> raw/soil.json         --->  data/processed/{field_id}/profile.json
  extract_imerg.py (stretch)                                     |
                                                                 v
 data/crops.json + rotations.json + parameters.json --> services/rotation_engine.py
 data/fields.json (farmer inputs)                              |
                                                               v
                                          POST /api/v1/rotations/compare  <---- priorities + scenario sliders
```

Rule: `DATA_MODE=demo` makes the backend read `data/demo/`; `DATA_MODE=processed` reads `data/processed/`. Everyone can run the whole app from day one on demo data.

---

## 3. Pilot setup

- **2 regions x 4 fields = 8 demo fields** (`F01` to `F08`). Suggested contrast: region A Punjab, Pakistan (cotton/rice/wheat belt, groundwater stress), region B US Midwest (corn/soybean, where the USDA Cropland Data Layer can sanity-check the existing rotation).
- Field boundaries are hand-drawn demo polygons. State this in the UI. NASA does not supply farm boundaries.
- Existing rotation comes from farmer input (`current_rotation_id`), labelled `source: "farmer_input"`.

---

## 4. Repository structure

```
field-shift/
├── README.md
├── .gitignore
├── .env.example                      # DATA_MODE, EARTHDATA_USERNAME, EARTHDATA_PASSWORD, GEE_PROJECT
├── data/
│   ├── fields.json                   # M3: 8 fields, farmer inputs
│   ├── crops.json                    # M3: 8 to 10 crops, calendars per region
│   ├── rotations.json                # M3: rotation library incl. existing per field
│   ├── parameters.json               # M3: scoring parameters (marked illustrative until validated)
│   ├── nasa_metadata.json            # M3: provenance for Evidence panel
│   ├── demo/
│   │   └── profiles/F01.json ...     # M1: synthetic profiles, data_mode "demo" (done by H0:45)
│   ├── raw/{field_id}/*.parquet|json # M1 pipeline output (git-ignored if large)
│   └── processed/{field_id}/profile.json   # M1: final per-field profile
├── pipeline/
│   ├── requirements.txt
│   ├── common.py                     # load fields, date ranges, cache helpers
│   ├── extract_power.py
│   ├── extract_smap.py
│   ├── extract_modis.py
│   ├── extract_terrain.py
│   ├── extract_soil.py
│   ├── extract_imerg.py              # stretch
│   ├── features.py                   # raw series -> derived features
│   └── build_profiles.py             # writes data/processed/{id}/profile.json
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py                   # single FastAPI app, CORS for :5173
│   │   ├── config.py                 # DATA_MODE, paths
│   │   ├── models/schemas.py         # FROZEN at H0:45 (section 6)
│   │   ├── api/{fields.py, rotations.py, meta.py, now.py}
│   │   ├── services/
│   │   │   ├── data_loader.py        # reads demo/ or processed/
│   │   │   ├── rotation_engine.py    # M2 core scoring
│   │   │   ├── explain.py            # M2 why/evidence/risks text from numbers
│   │   │   └── power_live.py         # optional 30-day "Right now" card
│   │   └── utils/validation.py
│   └── tests/{test_engine.py, test_api.py}
├── frontend/                         # M4: React + Vite + TypeScript
│   ├── package.json, vite.config.ts, .env.example
│   ├── public/mock/                  # copies of data/demo for offline UI work
│   └── src/
│       ├── main.tsx, App.tsx
│       ├── types/api.ts              # FROZEN, mirrors schemas.py
│       ├── api/client.ts             # real API or mock (VITE_USE_MOCK)
│       ├── store/useAppStore.ts      # selected field, priorities, scenario
│       ├── pages/{Overview.tsx, FieldDetail.tsx, Methodology.tsx}
│       └── components/
│           ├── FieldMap.tsx, FieldList.tsx
│           ├── PriorityPanel.tsx, ScenarioPanel.tsx
│           ├── RotationCompare.tsx, RotationCard.tsx, ScoreRadar.tsx
│           ├── EvidencePanel.tsx, DataQualityBadge.tsx
│           ├── ClimateCharts.tsx     # rain, NDVI by month, root-zone moisture
│           └── Disclaimer.tsx
└── docs/{NASA_DATA_SOURCES.md, METHODOLOGY.md, LIMITATIONS.md, DEMO_SCRIPT.md}
```

---

## 5. Variable dictionary (exact names, everyone uses these)

Naming rules: snake_case, unit suffix (`_mm`, `_c`, `_m3m3`, `_pct`, `_doy`), `null` means no observation, never 0.

### 5.1 Raw NASA variables (M1 pulls)

| Source | Product / ID (verify in catalog) | Variable | Units | Cleaning | Window |
|---|---|---|---|---|---|
| NASA POWER | Daily point API, `community=AG` | `PRECTOTCORR` | mm/day | `-999` to NaN | 2005 to latest (end = today minus 5 days) |
| NASA POWER | same | `T2M`, `T2M_MAX`, `T2M_MIN` | C | `-999` to NaN | same |
| NASA POWER | same | `RH2M`, `ALLSKY_SFC_SW_DWN` (optional) | %, kWh/m2/day | `-999` to NaN | same |
| NASA SMAP L4 | SPL4SMGP v007 (GEE: `NASA/SMAP/SPL4SMGP/007`) | `sm_surface`, `sm_rootzone` | m3/m3 | daily mean of 3-hourly values, mask fill | 2015-04 to latest |
| NASA MODIS | MOD13Q1 v061 (GEE: `MODIS/061/MOD13Q1`) | `NDVI`, `EVI` | scaled 0.0001 | multiply by 0.0001, drop poor `SummaryQA`, linear-interpolate 16-day composites to daily | 2010 to latest |
| NASA SRTM (stretch) | `USGS/SRTMGL1_003` | `elevation` to `elevation_m`, `slope_deg` | m, degrees | `ee.Terrain.slope` | static |
| NASA GPM IMERG (stretch) | `NASA/GPM_L3/IMERG_V07` band `precipitation` | `imerg_precip_mm` | mm/day | rate x hours, check unit in catalog | 2015 to latest |
| SoilGrids (non-NASA) | REST `rest.isric.org/soilgrids/v2.0/properties/query` | `clay`, `sand`, `soc`, `phh2o` at 0 to 5, 5 to 15, 15 to 30 cm, `mean` | see below | apply the unit factor in the response | static |

Soil unit handling: clay and sand arrive as g/kg (divide by 10 for percent), SOC as dg/kg (divide by 10 for g/kg), pH as pH x 10 (divide by 10). Check the response's unit factors before trusting this.

Optional POWER fallback for soil wetness if SMAP fails: `GWETROOT` (root-zone wetness, 0 to 1). It is MERRA-2 model output, not SMAP. Label it that way. Confirm the parameter name in the POWER docs.

### 5.2 Derived features (M1 `features.py` writes them into `profile.json`)

| Name | Definition | From |
|---|---|---|
| `monthly[]` | one record per year and month: `rain_mm, tmean_c, tmax_mean_c, tmin_mean_c, heat_days_ge{"30","34","38","42"}, frost_days_le_0c, dry_days_lt_1mm, smap_rootzone_m3m3, ndvi_mean` | POWER, SMAP, MODIS |
| `rain_annual_mm_mean` | mean of yearly rain totals | POWER |
| `rain_annual_cv` | std / mean of yearly totals | POWER |
| `rain_trend_mm_per_decade`, `tmean_trend_c_per_decade` | Sen slope (pymannkendall) | POWER |
| `dry_spell_max_days_mean` | mean yearly longest run of days < 1 mm | POWER |
| `heavy_rain_days_ge_25mm_mean` | mean yearly days >= 25 mm | POWER |
| `last_spring_frost_doy_p50`, `first_autumn_frost_doy_p50` | median day of year of last/first Tmin <= 0 C | POWER |
| `gdd_base10_annual_mean` | sum of max(0, (Tmax+Tmin)/2 - 10) | POWER |
| `eto_annual_mm_mean` | Hargreaves reference ET from Tmax, Tmin, latitude | POWER |
| `water_deficit_annual_mm_mean` | max(0, ETo - rain), monthly then summed | POWER |
| `smap_rootzone_mean_m3m3`, `smap_rootzone_p10_m3m3` | mean and 10th percentile | SMAP |
| `smap_dry_days_frac` | share of days below the field's own 20th percentile | SMAP |
| `smap_drydown_rate` (hypothesis feature) | mean daily decline in `sm_rootzone` in the 7 days after rain events | SMAP + POWER |
| `ndvi_monthly_mean[12]` | long-term monthly mean | MODIS |
| `ndvi_peak_mean`, `ndvi_peak_doy_mean` | yearly max and its day of year | MODIS |
| `bare_days_est_mean` | mean yearly days with interpolated NDVI < `ndvi_bare_threshold` (0.2, in parameters.json) | MODIS |
| `slope_deg`, `elevation_m` | terrain | SRTM |
| `soil_clay_pct, soil_sand_pct, soil_soc_g_kg, soil_ph` | 0 to 30 cm depth-weighted mean | SoilGrids |
| `now{}` | last 30 days: `rain_7d_mm, rain_14d_mm, rain_30d_mm, mean_temp_7d_c, max_temp_7d_c, rootzone_latest_m3m3, ndvi_latest, latest_dates{}` | all |

### 5.3 Farmer inputs (`fields.json`, M3)

`field_id, name, region_id, location{lat,lon}, geometry (GeoJSON Polygon), soil_type, irrigation ("none"|"limited"|"reliable"), current_rotation_id, market_access (1 to 5)`

### 5.4 Crop attributes (`crops.json`, M3, every row needs `references[]`)

`crop_id, name, type ("cereal"|"legume"|"oilseed"|"fiber"|"cover"|"fodder"), pest_family, growing_days, heat_threshold_c, max_heat_days_tolerated, frost_sensitive (bool), water_need_mm (per season), drought_tolerance (1 to 5), waterlogging_tolerance (1 to 5), root_depth_cm, n_fix_kg_ha, residue_cover ("low"|"med"|"high"), om_effect (-1 to 2), market_score (1 to 5), calendars{region_id: {sow_month, harvest_month}}, references[]`

Starter crop list (pick 8 to 10): wheat, maize, rice, cotton, soybean, mungbean, chickpea, sorghum, berseem (clover), cereal rye (cover).

### 5.5 Rotation library (`rotations.json`, M3)

`rotation_id, label, strategy_type ("existing"|"water_saving"|"soil_building"|"income"), region_id, sequence[] (ordered crop_ids, 2 to 3 seasons), cover_crop (crop_id or null), notes`
Every field must have its `current_rotation_id` present here. Minimum 3 rotations per region.

### 5.6 Request variables (M4 sends, M2 uses)

`priorities: {w_water, w_soil, w_income, w_resilience}` (sum to 1.0)
`scenario: {rain_multiplier (default 1.0, range 0.6 to 1.4), temp_delta_c (default 0.0, range 0 to 4)}`

### 5.7 Output variables (M2 produces)

Per rotation: `rotation_id, label, strategy_type, is_existing, scores{water, soil, resilience, income}, overall, overall_low, overall_high, rank, confidence ("HIGH"|"MEDIUM"|"LOW"), why[], benefits[], risks[], data_gaps[], needs_local_review[], evidence[]`
Evidence item: `variable, value, unit, source, interpretation`

### 5.8 Provenance (on every response)

`data_mode ("observed"|"demo")`, `data_sources{power,smap,modis,soil,terrain}`, `data_quality{...: "observed"|"derived"|"unavailable"|"demo"}`, `generated_at`

---

## 6. Frozen contracts (create these at H0:45, nobody changes names after)

`backend/app/models/schemas.py`

```python
from typing import Optional, Literal
from pydantic import BaseModel, Field

Quality = Literal["observed", "derived", "unavailable", "demo"]

class Location(BaseModel):
    lat: float
    lon: float

class FieldInfo(BaseModel):
    field_id: str
    name: str
    region_id: str
    location: Location
    soil_type: Optional[str] = None
    irrigation: Literal["none", "limited", "reliable"]
    market_access: Optional[int] = None
    current_rotation_id: str
    geometry: dict

class MonthRecord(BaseModel):
    year: int
    month: int
    rain_mm: Optional[float] = None
    tmean_c: Optional[float] = None
    tmax_mean_c: Optional[float] = None
    tmin_mean_c: Optional[float] = None
    heat_days_ge: dict[str, int] = {}
    frost_days_le_0c: Optional[int] = None
    dry_days_lt_1mm: Optional[int] = None
    smap_rootzone_m3m3: Optional[float] = None
    ndvi_mean: Optional[float] = None

class FieldProfile(BaseModel):
    field_id: str
    period_start: str
    period_end: str
    n_years: int
    monthly: list[MonthRecord]
    climatology: dict[str, Optional[float | list[float]]]   # names from section 5.2
    soil: dict[str, Optional[float]]
    terrain: dict[str, Optional[float]]
    now: dict[str, Optional[float | str | dict]]
    data_mode: Literal["observed", "demo"]
    data_sources: dict[str, str]
    data_quality: dict[str, Quality]

class Priorities(BaseModel):
    w_water: float = 0.25
    w_soil: float = 0.25
    w_income: float = 0.25
    w_resilience: float = 0.25

class Scenario(BaseModel):
    rain_multiplier: float = Field(1.0, ge=0.6, le=1.4)
    temp_delta_c: float = Field(0.0, ge=0.0, le=4.0)

class CompareRequest(BaseModel):
    field_id: str
    priorities: Priorities = Priorities()
    scenario: Scenario = Scenario()
    rotation_ids: Optional[list[str]] = None

class EvidenceItem(BaseModel):
    variable: str
    value: Optional[float | str] = None
    unit: str
    source: str
    interpretation: str

class RotationScore(BaseModel):
    rotation_id: str
    label: str
    strategy_type: str
    is_existing: bool
    scores: dict[str, float]            # water, soil, resilience, income (0 to 100)
    overall: float
    overall_low: float
    overall_high: float
    rank: int
    confidence: Literal["HIGH", "MEDIUM", "LOW"]
    why: list[str]
    benefits: list[str]
    risks: list[str]
    data_gaps: list[str]
    needs_local_review: list[str]
    evidence: list[EvidenceItem]

class CompareResponse(BaseModel):
    field_id: str
    scenario_applied: bool
    rotations: list[RotationScore]      # always >= 3, includes the existing rotation
    data_mode: Literal["observed", "demo"]
    data_quality: dict[str, Quality]
    disclaimer: str
```

`frontend/src/types/api.ts` must mirror the same names (camelCase is not used; keep snake_case so JSON maps 1:1).

### Endpoints (frontend talks only to these)

| Endpoint | Owner | Purpose |
|---|---|---|
| `GET /api/v1/health` | M2 | liveness |
| `GET /api/v1/fields` | M2 | list `FieldInfo` |
| `GET /api/v1/fields/{id}/profile` | M2 (reads M1 output) | `FieldProfile` |
| `POST /api/v1/rotations/compare` | M2 | `CompareResponse` |
| `GET /api/v1/crops`, `GET /api/v1/rotations` | M2 | lists for UI labels |
| `GET /api/v1/meta/sources` | M2 | contents of `nasa_metadata.json` |
| `GET /api/v1/fields/{id}/now` (optional) | M2 | live 30-day POWER card |

---

## 7. Scoring method (M2 implements, M3 owns the parameters)

All parameters live in `data/parameters.json`, marked `"validated": false` until M3 checks them against references. Components are 0 to 100.

For rotation R, field f, historical year y, season s (months window from the crop calendar of the field's region):

- `season_rain_mm[y,s]` = sum of `rain_mm` over window x `rain_multiplier`
- `irrigation_mm` = `none` 0, `limited` 150, `reliable` 400 (parameters.json)
- `season_heat_days[y,s]` = sum of `heat_days_ge[bucket]` over window, where bucket = nearest of 30/34/38/42 to `heat_threshold_c - temp_delta_c`
- `viable[y,s]` = heat days <= `max_heat_days_tolerated` AND NOT (frost days > 0 AND `frost_sensitive`) AND rain + irrigation >= 0.6 x `water_need_mm`

Components:
- **resilience** = 100 x mean of `viable` over all years and seasons
- **water** = 100 x (1 - clip(mean of max(0, `water_need_mm` - rain - irrigation) / `water_gap_ref_mm`, 0, 1))
- **soil** = 0.5 x soil_health + 0.3 x erosion + 0.2 x pest_break
  - soil_health = 100 x clip(0.7 x (mean `om_effect` + 1) / 3 + 0.3 x clip(sum `n_fix_kg_ha` / `n_ref_kg_ha`, 0, 1), 0, 1)
  - erosion = 100 x (1 - clip(bare_fraction x (1 + `slope_deg`/10) x clip(`heavy_rain_days_ge_25mm_mean` / `heavy_ref_days`, 0.2, 1), 0, 1)), bare_fraction from months between harvest and next sowing, and from `bare_days_est_mean` for the existing system
  - pest_break = mean over consecutive crop pairs of (100 if different `pest_family` else 20)
- **income** = 20 x mean `market_score`, scaled by field `market_access` / 5

Overall = `w_water` x water + `w_soil` x soil + `w_income` x income + `w_resilience` x resilience.

Uncertainty: compute the overall score per historical year, then `overall_low` = 10th percentile, `overall_high` = 90th percentile.

Confidence: coverage = share of available inputs among POWER, SMAP, MODIS, soil, terrain. HIGH needs coverage >= 0.8, `n_years` >= 10 and `validated: true`. MEDIUM needs coverage >= 0.5. Otherwise LOW.

Text rules: `why` comes from the two components where the rotation differs most from the existing one. `data_gaps` lists unavailable sources. `needs_local_review` lists unvalidated parameters, farmer-input fields and anything that depends on a 9 km SMAP cell or 250 m MODIS pixel.

Optional "Right now" card (Tier 3): `now_status` ("FAVORABLE"|"WATCH"|"STRESSED") plus `now_reasons[]` from `now{}` and thresholds in parameters.json. This replaces the blueprint's RESUME/DELAY/SWITCH/REPAIR.

---

## 8. Tasks per member, in order

### Shared (all, first 45 minutes, ideally before the clock)
1. Create the repo and folders from section 4.
2. Earthdata Login account, Google Earth Engine project registered, one test call per source saved.
3. Lead (M2) commits `schemas.py`, `api.ts` stub, `.env.example`. Names are frozen.

### M1: NASA data and features (inputs: `fields.json`; outputs: `profile.json`)
1. (by H0:45) Write 8 synthetic profiles to `data/demo/profiles/`, `data_mode: "demo"`, shaped exactly like `FieldProfile`. This unblocks M2 and M4.
2. `extract_power.py`: dated daily series per field to parquet. Done when 15+ years are present and `-999` is NaN.
3. `features.py`: monthly records and climatology from POWER only. Done when `profile.json` validates against `FieldProfile` (Tier 1).
4. `extract_smap.py` (Earth Engine): daily `sm_surface`, `sm_rootzone`. Done when 2015 to now loads and gaps are null.
5. `extract_modis.py`: NDVI scaled, quality-filtered, interpolated. Add `bare_days_est_mean`, `ndvi_monthly_mean`.
6. `extract_soil.py` (SoilGrids) and `extract_terrain.py` (SRTM).
7. Stretch: `extract_imerg.py` and a POWER vs IMERG rainfall agreement note for the methodology page.
8. `build_profiles.py` runs everything and writes `data/processed/`. Never invent a value: unavailable stays null with `data_quality: "unavailable"`.

### M2: engine, API and integration lead (inputs: profile, crops, rotations, parameters; outputs: `/compare`)
1. `main.py`, `config.py`, `data_loader.py`: `DATA_MODE` switch, `/health`, `/fields`, `/fields/{id}/profile` on demo data.
2. `rotation_engine.py`: section 7 formulas using demo profiles plus M3's draft crops. Unit tests in `test_engine.py` (known inputs, expected ranking, null handling, scenario changes the score).
3. `explain.py`: why, benefits, risks, gaps, evidence generated from numbers, not fixed text.
4. `POST /rotations/compare` returning at least 3 rotations including the existing one.
5. Switch to `processed` data once M1 lands real profiles. Owns merges and end-to-end tests.
6. Optional `now.py` with live POWER for the "Right now" card.

### M3: agronomy, data and documentation (inputs: references; outputs: JSON files and docs)
1. (by H1) `fields.json` (8 fields, real coordinates, hand-drawn polygons), draft `crops.json` (3 crops per region first), `rotations.json` (3 per region), `parameters.json`. M2 and M4 need these first.
2. Finish 8 to 10 crops with `references[]` for each key attribute. Mark parameters `validated` only when sourced.
3. `nasa_metadata.json`: product, version, variable, units, resolution, limitations per dataset.
4. `docs/METHODOLOGY.md`, `LIMITATIONS.md` (9 km SMAP, 250 m MODIS, 16-day composite, demo boundaries, farmer-input fields, illustrative thresholds).
5. Pick the demo story: one field where the existing rotation scores worst and a better option is clear, plus one where the answer is "keep current". Write `DEMO_SCRIPT.md` (3 minutes).
6. QA role: check ranges, spot-check M1 numbers against NASA portals.

### M4: frontend (React + Vite + TypeScript) (inputs: `api.ts`, demo JSON; outputs: working UI)
1. Scaffold the app, routing, store, `VITE_USE_MOCK=true` reading `public/mock/` copies of demo data. No waiting on backend.
2. `FieldMap` + `FieldList`: select a field, show polygon, status badge.
3. `PriorityPanel` (4 sliders that keep the sum at 1.0) and `RotationCompare`: 3 rotation cards side by side with scores, `overall_low` to `overall_high` range, rank, confidence.
4. `RotationCard` detail: why, evidence, benefits, risks, data gaps, "needs local review".
5. `ClimateCharts` (monthly rain, NDVI curve with bare periods shaded, root-zone moisture) and `ScoreRadar`.
6. `ScenarioPanel`: rain multiplier and temperature delta call `/compare`; label "Simulated conditions, not a NASA forecast".
7. `DataQualityBadge` on every number (observed, derived, demo, unavailable), `Disclaimer`, `Methodology` page from M3's docs.
8. Switch to the real API (`VITE_API_URL`), fix mismatches, mobile layout check.

---

## 9. 10-hour workflow with incremental tiers

Each tier is shippable. If time runs out, you submit the last completed tier.

| Hour | Checkpoint | Tier |
|---|---|---|
| H0:00 to 0:45 | Repo, frozen contracts, accounts, demo profiles | setup |
| H2:00 | **Checkpoint A:** whole app runs on demo data: 8 fields, 3 rotations each, sliders move scores | Tier 0 (submittable) |
| H4:00 | **Checkpoint B:** real POWER history in profiles, scores based on real climate | Tier 1 |
| H6:00 | **Checkpoint C:** real SMAP and MODIS, evidence panel and charts complete, scenario sliders working | Tier 2 |
| H8:00 | **Checkpoint D:** methodology and limitations pages, confidence logic, "Right now" card, IMERG and SRTM if ready. Feature freeze at H8:30 | Tier 3 |
| H9:00 | Rehearse, record backup demo video, README | polish |
| H10:00 | Submit | done |

Daily rhythm: merge to `main` at every checkpoint, not at the end. M2 reviews. Nobody edits `schemas.py` or `api.ts` without telling the team.

---

## 10. Libraries to install

**Backend** (`backend/requirements.txt`)
```
fastapi
uvicorn[standard]
pydantic>=2
httpx
python-dotenv
pandas
numpy
scipy
pyarrow
pymannkendall
pytest
```
Run: `python -m venv venv`, activate, `pip install -r requirements.txt`, `uvicorn app.main:app --reload --port 8000`

**Pipeline** (`pipeline/requirements.txt`, M1 only)
```
earthengine-api
earthaccess
h5py
xarray
netCDF4
requests
tqdm
pandas
numpy
pyarrow
pymannkendall
```
First run: `earthengine authenticate`, then `earthaccess.login()`.

**Frontend (M4)**
```
npm create vite@latest frontend -- --template react-ts
cd frontend
npm i react-router-dom leaflet react-leaflet recharts @tanstack/react-query zustand lucide-react
npm i -D @types/leaflet tailwindcss @tailwindcss/vite
```
Add `import "leaflet/dist/leaflet.css"` in `main.tsx`. Vite is used instead of Next.js because Leaflet needs the browser and causes server-rendering issues in Next. Dev server: `npm run dev` (port 5173).

---

## 11. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Earth Engine access delayed | AppEEARS point-sample API for MODIS, SMAP, SRTM; `earthaccess` for a few granules |
| SMAP extraction fails | POWER `GWETROOT` labelled as MERRA-2 model output, or leave null and lower confidence |
| MODIS late | Skip bare-days from NDVI; use crop-calendar bare months and say so in `data_gaps` |
| POWER API slow or down | Use cached parquet (it is committed or on the shared drive) |
| Scenario logic too complex | Rain multiplier only, then add temperature |
| Parameters not validated in time | Keep `validated: false`, cap confidence at MEDIUM, show "illustrative" badge |
| Frontend blocked by backend | `VITE_USE_MOCK=true` |

---

## 12. Definition of done

- [ ] 8 fields on a map, each selectable
- [ ] At least 3 rotations compared per field, including the existing one
- [ ] Each rotation shows why, evidence, benefits, risks, data gaps, needs-local-review
- [ ] Priority sliders and scenario sliders change the results
- [ ] POWER, SMAP and MODIS values are real and carry provenance and dates
- [ ] Every number shows observed, derived, demo or unavailable
- [ ] Uncertainty range and confidence shown
- [ ] Methodology and limitations pages explain 9 km SMAP, 250 m MODIS, 16-day composites and illustrative thresholds
- [ ] Disclaimer: supports farmers and advisers, does not replace them
- [ ] 3-minute demo script rehearsed, backup video recorded

## 13. Demo script (3 minutes)

1. Problem (30 s): shifting rain and heat, falling soil health, rotation choice is hard.
2. Pick a field on the map (20 s): show its NASA-derived profile (rain trend, root-zone moisture, bare period).
3. Compare 3 rotations (60 s): existing vs water-saving vs soil-building, with ranges and confidence.
4. Change priorities, then a drier scenario (30 s): ranking changes, explain why.
5. Honesty slide (20 s): data quality badges, what needs local review.
6. Close (20 s): works anywhere because the core uses global NASA data; local data plugs in.
