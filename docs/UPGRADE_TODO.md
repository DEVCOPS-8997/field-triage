# Field Triage upgrade: TODO tracker

Status: ✅ done · 🔄 in progress · ⬜ not started · ⚠️ blocked / needs you

## Your decisions (2026-11-15)
- Current crop matches several rotations → **auto-pick the most common one and show "change if wrong"**
- Results → **current rotation + best of each strategy type**, plus a "Show all" button
- NDVI source → **NASA Earthdata / AppEEARS** (you create the account); ORNL is kept as first try
- Uncited legume nitrogen → **research and fill in the cited numbers**

## 1. Data compatibility (75 crops, 54 rotations, 4 provinces) ✅
- ✅ `regions.json`: Punjab, Sindh, KP (2 boxes), Balochistan, plus province names and calendar fallback chains
- ✅ Province resolver: rectangle, then OpenStreetMap reverse geocode where boxes overlap, then file order (flagged)
- ✅ Missing provincial calendars borrow a neighbour's (13 cases), shown to farmers as "check locally"
- ✅ Heat days counted at every degree 24–49 °C (crop thresholds 28–45 °C are now exact)
- ✅ Legume nitrogen: citations re-attached for chickpea and mungbean
- ✅ Researched and filled cited nitrogen (conservative "left for next crop" value + field range + sources): guar 45→35, mash 42→35, lentil 45, peas 55, soybean 60→65, groundnut 65→75, berseem 120→60, lucerne 150→100
- ✅ US demo fields F05–F08 removed (no US crops or rotations left in your data)
- ✅ `validate_data.py` passes
- ✅ Current-crop mapping: deterministic auto-pick (conventional first) plus a "change if wrong" warning
- ✅ Tests updated to the new catalog and kept offline: **78/78 passing**
- ⚠️ Finding for you: in `rot_pk_cotton_wheat_mung`, cotton (May–Nov) plus wheat (Nov–Apr) already cover all 12 months, so the mungbean cover never has a gap and adds nothing. Consider a different cash pair, or model mungbean as a relay crop.

## 2. MODIS NDVI per lat/lon (critical) 🔄
- ⚠️ ORNL `modis.ornl.gov` fails the TLS handshake from this network (POWER works). Likely an ORNL-side block for this region.
- ⬜ Backend `modis_ndvi.py`: provider chain ORNL → NASA AppEEARS (Earthdata login) → crop-calendar fallback
- ⬜ QA filter (pixel reliability 0/1), monthly mean, bare days (NDVI < 0.2), latest NDVI, disk cache per 250 m pixel
- ⬜ Background job plus `GET /locations/ndvi` status endpoint, merged into the profile when ready
- ⬜ Test the AppEEARS path once Earthdata credentials are in `backend/.env`

- ✅ Backend `modis_ndvi.py`: ORNL (15 s probe limit + canary + 120 s download limit) → AppEEARS → fallback; QA filter, monthly mean, bare days, disk cache per 250 m pixel
- ✅ Verified live: with ORNL down (503 / TLS stall) and no Earthdata login, the job ends cleanly as `not_configured` in ~16 s
- ✅ `GET /locations/ndvi` status endpoint; compare merges cached NDVI into the profile and starts a background fetch otherwise
- ✅ 5 offline unit tests (CSV parsing, QA filter, aggregation, profile merge, no-provider state)
- ⚠️ ORNL confirmed blocked from this network (curl error 35, TLS). **You need to add `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` to `backend/.env`** for live NDVI.

## Contract for the parallel agents ✅
- Request: `constraints` (`water_available_mm`, `min_income_usd_ha`, `max_bad_seasons_in_10`, `unavailable_equipment[]`)
- Per rotation: `shortlisted`, `shortlist_reason`, `fits_constraints`, `constraint_failures[]`, `farm_year[12]`, `key_moments[]`, `mean_water_need_mm`, `mean_irrigation_gap_mm`
- Response: `total_candidates`, `constraints_applied`, `data_retrieval.ndvi`

## Parallel agents (launched)
| Agent | Owns | Tasks |
|---|---|---|
| A · backend-engine | `backend/**`, `data/parameters.json` | 3 (shortlist, limits), 5 (farm_year, key_moments), tests |
| B · frontend-analysis | LocationAnalysis, inputs, leaderboard/hero/detail, farm-year strip, api client, mocks | 4 (real units), 5 (UI), NDVI polling, shortlist UI |
| C · frontend-points | Term/glossary, climate/evidence/site/data-sources panels, maps, FieldEditor, MyFields, account api | 6 (9, 13, 14, 16) |
| D · frontend-urdu | i18n, fonts, AppShell, Overview/Account/Methodology, ui primitives | 7 (switcher, fonts, RTL, translate, design pass) |
| Final (me) | — | Urdu sweep of B/C files, integration, full checks |

## 3. Deterministic, stronger engine ✅ (agent A, 101 tests passing)
- ✅ Scores every rotation in the province; deterministic shortlist (current + best fitting option per type: water-saving, soil-building, income, conventional)
- ✅ Hard limits: water per season, equipment (`equipment_needs` in parameters.json, marked illustrative), minimum income, bad seasons in 10, each with a plain "doesn't fit because…" sentence
- ✅ NDVI-observed bare days used for the current rotation when MODIS has been merged
- ✅ `farm_year` (12 months: crops, stage, bare, heat/frost/dry/heavy-rain risk, erosion alert, NDVI, opportunity) + 2–3 `key_moments` sentences, in `backend/app/services/farm_year.py`
- ✅ New monthly `heavy_rain_days_ge_25mm` from daily POWER rain (mirrored in api.ts)
- ⚠️ Open questions from agent A (for you): water-limit rule uses the minimum share a crop needs (not full demand); opportunity months require zero frost in every past year; the heavy-rain row ignores the rain "what if" slider

## 4. Real-unit farmer inputs (replace the 0–1 sliders) ⬜
- ⬜ Water available: mm, inches, acre-feet, m³, tubewell hours × flow rate, canal turns
- ⬜ Income target: PKR or USD, per acre or per hectare
- ⬜ Risk tolerance in plain words ("I can accept a bad season 1 in N years")
- ⬜ Priorities as ranked choices, not decimals

## 5. Key moments: "Your farm's year" ✅
- ✅ Backend data + sentences (agent A)
- ✅ `FarmYearCard` / `FarmYearStrip` (current vs any alternative, Low/Some/High with icon + word, "Soil loss" tag, "–" for not relevant) (agent B)
- ✅ Live check: 36 rotations scored, shortlist + constraint failures + key moments returned correctly

## 4b. Real-unit inputs ✅ (agent B)
- ✅ Water: mm, inches, acre-inches, acre-feet, m³, tubewell hours × L/s, canal turns × hours × cusecs (area in acre/ha/kanal) → mm
- ✅ Income: PKR/USD per acre/ha (editable rate) → USD/ha; bad seasons in 10; equipment; goal order → weights 0.4/0.3/0.2/0.1; weather "what if" in mm/year and °C
- ✅ Shortlist UI with "Show all N", "Doesn't fit your farm because…"; NDVI download chip + auto re-run; mock mode works offline
- ⚠️ Open questions from agent B (for you): keep the 5th rain choice "much more"? Defaults OK (tubewell 28 L/s, canal turn 3 h at 1 cusec, 280 PKR/USD)? Put water/income/goals in the share link too?

## NDVI with your Earthdata login
- ✅ `.env` values checked (no quotes or spaces left); AppEEARS login OK (HTTP 200); backend restarted
- 🔄 Downloading NDVI for the 4 demo fields

## 6. Partly covered challenge points ✅ (agent C, type-check clean)
- ✅ (9) Equipment checkboxes in FieldEditor, saved with the field; "Analyze" passes `&equip=…`. Optional migration `supabase/migrations/0002_field_equipment.sql` (works without it)
- ✅ (13) `<Term>` ⓘ glossary (12 terms) used across climate, water, now, site, evidence and data-source panels
- ✅ (14) `SatelliteVsGround` card inside DataSourcesPanel; MODIS NDVI is listed once merged, with a "downloading" chip
- ✅ (16) `FieldRiskMap` card (field outline coloured and dash-patterned by erosion risk) + `erosionByField` prop on FieldMap; agent B is wiring it into LocationAnalysis
- ⚠️ Open questions from agent C (for you): remove the old free-text "Machines you have" box? Accept the erosion screening thresholds (≥30% of years with a 25 mm day; slope bands 2/5/10°)? Should "Analyze" use only saved equipment choices?

## 7. Urdu 🔄
- ✅ i18n system, EN/اردو switcher, Noto Nastaliq Urdu (h1/h2) + Noto Naskh Arabic (body), RTL, Ltr/EnglishOnlyNote helpers (agent D)
- ✅ Translated: app shell, Overview, Account, Methodology, Field detail, UI kit, badges, map search
- 🔄 Remaining sweep (stopped by the 5-hour usage limit; resumes after 3 pm PKT): analysis screen + inputs + farm year, result panels + glossary, field editor/My Fields/maps. Untranslated strings fall back to English, so nothing is broken.
- ✅ NDVI AppEEARS: retries on network/DNS blips and resumes a submitted task instead of resubmitting
- ⬜ Language switcher (EN / اردو), persisted per viewer
- ⬜ Noto Nastaliq Urdu (headings) plus Noto Naskh Arabic (body/UI) for readability; RTL layout; line-height tuned so Nastaliq isn't clipped
- ⬜ Translate the UI strings and insight titles
- ⬜ Design and formatting pass after Urdu lands

## 8. Wrap-up ⬜
- ⬜ Full backend tests, data validator, frontend build
- ⬜ README / Methodology updates (shortlist rule, NDVI, units)
