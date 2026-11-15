# Field Triage: Final Project Documentation

**NASA International Space Apps Challenge 2026 · Challenge: Field Shift · Team Krypton Knights**
Repository: <https://github.com/DEVCOPS-8997/field-triage> (public)
Document date: 15 November 2026

> **Decision support only.** Field Triage shows how crop rotations would have performed under 20+ years of past NASA weather at a place. It is not a forecast. It does not replace a farmer's judgment, an agronomist, or a soil test.

> ⚠️ **Team action needed before submission:** the background photo `frontend/public/backgrounds/farm-valley.jpg` (shown behind every app screen, and so in the videos and slides) has **no recorded source or licence**. Credit it in the "Space Agency Partner & Other Data" field with its source URL, or replace it with an image whose licence you know. Space Apps requires every image used to be listed.

---

## Contents

1. [Team](#1-team)
2. [Submission checklist](#2-submission-checklist)
3. [Ready-to-paste answers](#3-ready-to-paste-answers)
4. [How the project meets the challenge](#4-how-the-project-meets-the-challenge)
5. [System architecture and request flow](#5-system-architecture-and-request-flow)
6. [Frontend: pages and navigation](#6-frontend-pages-and-navigation)
7. [Technology stack](#7-technology-stack)
8. [NASA data used](#8-nasa-data-used)
9. [Space Agency Partner data and other data](#9-space-agency-partner-data-and-other-data)
10. [External APIs and services](#10-external-apis-and-services)
11. [Backend REST API reference](#11-backend-rest-api-reference)
12. [Science and scoring method](#12-science-and-scoring-method)
13. [Crop and rotation catalog](#13-crop-and-rotation-catalog)
14. [Explanations: benefits, risks, gaps, checks, evidence](#14-explanations-benefits-risks-gaps-checks-evidence)
15. [User accounts and saved fields (Supabase)](#15-user-accounts-and-saved-fields-supabase)
16. [Data quality, honesty rules and limitations](#16-data-quality-honesty-rules-and-limitations)
17. [Installation, running and testing](#17-installation-running-and-testing)
18. [Demo assets (videos and slides)](#18-demo-assets-videos-and-slides)
19. [Use of AI (Super Intelligence) disclosure](#19-use-of-ai-super-intelligence-disclosure)
20. [References](#20-references)

---

## 1. Team

| Member | Name | Role |
|---|---|---|
| M1 | **Ahmed Jabbar** (team lead) | NASA dataset collection (`pipeline/`, `data/raw`, `data/processed`) |
| M2 | **Muhammad Naveed Qasim** | Backend: API, rotation engine, data services (`backend/`) |
| M3 | **Muhammad Safiullah** | Local crop data collection (`data/*.json`) |
| M4 | **Muhammad Tayyab Abdullah Malik** | Frontend: UI / UX and web app (`frontend/`) |

**Team name:** Krypton Knights · **Challenge:** Field Shift · **Project name:** Field Triage

---

## 2. Submission checklist

Source: the official 2026 [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) and [Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/).

**Deadline:** Sunday 15 November 2026, 11:59 p.m., in the time zone of the team's Local Event.

| Form field | Where to find it here |
|---|---|
| Project Name | **Field Triage** |
| High-Level Project Summary | §3.3 |
| Link to Project Demo | §18. The global video is 28.7 s (limit 30 s); the slides are 7 (limit 7). Host publicly with no login. |
| Link to Final Project | <https://github.com/DEVCOPS-8997/field-triage> |
| Detailed Project Description | §3.4 |
| Use of Super Intelligence | §19 |
| NASA Data | §3.5 (links) and §8 (detail) |
| Space Agency Partner Data and Other References | §3.6 (links) and §9–§10 |

**Rules to keep:**
- Over 30 seconds or over 7 slides is **not eligible for Global Judging**.
- Everything in English. No images, video or audio of anyone under 18.
- AI-generated content must not use NASA logos, flags or mission identifiers. The demo uses none.
- AI-generated images and video need a visible watermark. The videos carry the label "Real app screens · synthetic voice-over · AI-assisted edit".
- Test every link in a private browser window. Then tick both confirmation boxes and press **Submit for Judging**.

**How judges score (1–5 each):** Impact, Creativity, Validity, Relevance, Presentation.

---

## 3. Ready-to-paste answers

### 3.1 What problem does your project address, and who would use it?

Farmers choose a crop rotation that they then keep for years. Each year that choice gets riskier: hotter flowering seasons, erratic rain, falling water tables, more erosion and tired soil. A crop that helps the soil in one village can run out of water, burn in the heat, or miss the market in the next. Most smallholder farmers make this decision without any climate evidence for their own field.

**Who would use it:** smallholder and family farmers (starting with Punjab, Sindh, Khyber Pakhtunkhwa and Balochistan in Pakistan), agricultural extension workers and advisers who counsel them, and farmer cooperatives planning which crops to grow.

### 3.2 What did your team build, and how does it work?

We built **Field Triage**, a web app for crop-rotation decision support.

1. **Find the field.** The farmer searches a village, uses GPS, or drops a pin on a satellite map. Signed-in users can draw the exact field outline, and the app measures it live.
2. **Describe the farm.** The farmer gives their current rotation and irrigation. In real units, they can also set the water they can supply (tubewell hours, canal turns, mm or acre-feet), the income they need, how many bad seasons they can accept, any equipment they lack, and what matters most to them.
3. **Replay the past.** The backend downloads 20+ years of daily **NASA POWER** weather for that spot: rain, temperature, humidity, wind, sunlight and root-zone soil wetness. It adds **MODIS NDVI** greenness, **SoilGrids** soil and **Copernicus DEM** slope. It then replays every past season of every rotation in the province: FAO-56 crop water demand, heat at flowering, frost and water shortfall.
4. **Compare and explain.** All rotations in the province are scored (36 in Punjab) on Water, Soil, Resilience and Income, weighted by the farmer's priorities. The app shows the farmer's current rotation next to the best water-saving, soil-building, income and conventional options. For each one it explains why it was suggested, its benefits, risks, data gaps and what to check locally, each with a cited source. A month-by-month "farm year" shows bare-soil months and when heat, dry spells or heavy rain usually hit.

Scoring is deterministic maths with no AI at runtime. Missing data is never shown as zero. The app works in English and Urdu.

### 3.3 Summary (≈170 words)

Field Triage is a web app that helps farmers compare crop rotations for their own field using NASA Earth observation data. A farmer finds their village on a satellite map, or draws their field, and enters their current rotation, water supply, income needs and priorities. The app then replays more than 20 years of daily NASA POWER weather for that exact spot, together with MODIS vegetation greenness, SoilGrids soil and Copernicus elevation data. It tests every past season of every rotation in the province for heat at flowering, frost and water shortfall, using FAO-56 crop-water science. The farmer's current rotation is ranked against the best water-saving, soil-building, income and conventional alternatives on Water, Soil, Resilience and Income. Each option comes with plain-language reasons, benefits, risks, information gaps and local checks, all linked to sources, in English or Urdu. As heat and water stress grow, rotation choices made today decide soil health and farm income for years. Field Triage gives farmers evidence for that choice while supporting, not replacing, their own experience and local experts.

### 3.4 Project Details

**What it does and how it works**
- **Find the place.** OpenStreetMap search, device GPS or a map pin. Signed-in users draw the field as a free shape, rectangle or circle, with live area (m², ha, acres), perimeter and side lengths, checked again on the server by PostGIS.
- **Farmer inputs in real units.** Current rotation and irrigation. Water available per season (mm, inches, acre-feet, m³, tubewell hours × flow, canal turns). Minimum income (PKR or USD, per acre or per hectare). Bad seasons accepted per 10 years. Equipment the farmer does *not* have. Priorities ranked as goals. "What if" weather sliders for rainfall and warming.
- **NASA data.** The backend fetches NASA POWER daily data from 2005 to today for the point (8 parameters, cached per 0.5° cell). It also fetches MODIS MOD13Q1 NDVI per 250 m pixel, through ORNL or NASA AppEEARS, as a background job.
- **Agro-meteorology.** FAO-56 Penman-Monteith reference evapotranspiration (Hargreaves fallback), USDA-SCS effective rainfall, and Saxton-Rawls soil water from SoilGrids texture.
- **Season replay engine.** Every crop is checked in every past year over its regional calendar. Heat counts only at flowering, frost from development through mid-season, and water as supply versus FAO-56 crop demand. A season is viable only if all three pass.
- **Scores (0–100):**
  - Water: mean seasonal shortfall.
  - Soil: living-root months, sourced legume nitrogen, erosion (bare months × slope × heavy rain) and pest-cycle break (USDA-NRCS 328).
  - Resilience: share of viable past seasons.
  - Income: FAOSTAT yield × price, scored only when current official data exists.
  - Overall: weighted by the farmer's priorities, with a 10th–90th percentile range across past years.
- **Shortlist.** All rotations in the province (75 crops and 54 rotations across 4 provinces) are scored. The farmer sees their current rotation plus the best water-saving, soil-building, income and conventional options, with "doesn't fit your farm because…" when a limit fails.
- **Explanations.** Rule-based, farmer-language statements: why, benefits, risks, gaps and farm checks, each with a source link. The evidence explorer shows every number used.
- **Farm year.** A 12-month strip showing crops, growth stage, bare soil, and heat, frost, dry-spell and heavy-rain risk, plus key moments.
- **Site and now.** Soil, slope, an erosion-risk map of the field, and the last 14–30 days' conditions (favourable, watch or stressed).

**Benefits**
- Free, global NASA data, so it needs no local sensors.
- Shows the trade-offs between water, soil, income and resilience.
- Flags bare-soil months, heat and frost at vulnerable stages, pest-cycle breaks and nitrogen savings (bags of urea).
- Honest about uncertainty: confidence levels, score ranges, data gaps, a "satellite vs ground" explainer, and cards hidden when data is missing.

**Intended impact:** Give farmers and extension workers an evidence-based way to start conversations about switching to rotations that use less water, protect soil and fail less often in hotter, drier seasons. The tool supports their judgment, it does not replace it.

**Tools, languages, hardware and software**
- **Languages:** Python 3.12, TypeScript, SQL (PostgreSQL/PostGIS), HTML/CSS.
- **Backend:** FastAPI, Uvicorn, Pydantic v2, httpx, pandas, NumPy, SciPy, rasterio, pymannkendall, python-dotenv, pytest (101 tests).
- **Frontend:** React 19, Vite 8, TypeScript 7, Tailwind CSS 4, React Router 7, TanStack Query 5, Zustand, Leaflet / react-leaflet, Recharts, lucide-react, oxlint. Fonts: Fraunces, Plus Jakarta Sans, Noto Nastaliq Urdu, Noto Naskh Arabic.
- **Database and accounts:** Supabase (PostgreSQL + PostGIS, Row-Level Security, email auth).
- **Data pipeline:** Google Earth Engine API, NASA earthaccess, NASA AppEEARS, xarray, h5py, netCDF4.
- **Development tools:** VS Code, Git/GitHub, Playwright, Claude Code (AI coding assistant; no AI at runtime).
- **Hardware:** none. It runs in any browser on phone or desktop.

**How it is creative**
- Instead of a one-off forecast, it *replays* two decades of real NASA weather through each rotation, season by season, for the farmer's exact spot.
- It turns that into plain-language reasons, each with a citation.
- Farmers enter limits in the units they actually use, such as tubewell hours, canal turns, PKR per acre and "bad seasons in 10".
- It runs in Urdu with right-to-left layout.

**Factors we considered**
- Farmers with little technical background: plain words, glossary tooltips, Urdu, mobile layout.
- Data honesty: null is never zero, income is only shown with current data, and unsupported regions are refused.
- The 50 km NASA POWER cell versus field scale.
- Unvalidated parameters, so confidence is capped at MEDIUM.
- Privacy: Row-Level Security on saved fields.
- Cost: free, keyless APIs plus caching.
- Supporting, not replacing, local agronomists.

### 3.5 NASA Data (Link Text: URL)

- NASA POWER (Prediction Of Worldwide Energy Resources) Daily API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- NASA POWER project: https://power.larc.nasa.gov/
- MERRA-2 Reanalysis (NASA GMAO, source of POWER weather and root-zone wetness): https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/
- CERES (NASA LaRC, source of POWER solar radiation): https://ceres.larc.nasa.gov/
- MODIS Terra Vegetation Indices MOD13Q1 v061 (LP DAAC): https://lpdaac.usgs.gov/products/mod13q1v061/
- NASA AppEEARS (MODIS NDVI point extraction): https://appeears.earthdatacloud.nasa.gov/
- ORNL DAAC MODIS Web Service: https://modis.ornl.gov/data/modis_webservice.html
- SMAP L4 Global 3-hourly 9 km Surface and Root Zone Soil Moisture, SPL4SMGP v008 (NSIDC DAAC): https://nsidc.org/data/spl4smgp/versions/8
- NASA Earthdata Login: https://urs.earthdata.nasa.gov/
- JPL Publication 07-03, Chamberlain & Duquette, "Some Algorithms for Polygons on a Sphere" (field area maths): https://trs.jpl.nasa.gov/handle/2014/41271

### 3.6 Space Agency Partner & Other Data (Link Text: URL)

**Space Agency Partner**
- Copernicus DEM GLO-30 (ESA / EU Copernicus): https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model
- Copernicus DEM on AWS Open Data: https://registry.opendata.aws/copernicus-dem/

**Other data and science**
- ISRIC SoilGrids v2.0: https://www.isric.org/explore/soilgrids
- SoilGrids REST API: https://rest.isric.org/soilgrids/v2.0/docs
- FAOSTAT (yield and producer prices): https://www.fao.org/faostat/en/#data
- FAO Irrigation and Drainage Paper 56 (crop evapotranspiration): https://www.fao.org/4/x0490e/x0490e00.htm
- FAO CROPWAT (USDA-SCS effective rainfall): https://www.fao.org/land-water/databases-and-software/cropwat/en/
- FAO EcoCrop: https://gaez.fao.org/pages/ecocrop
- FAO GAEZ v4: https://gaez.fao.org/
- Saxton & Rawls 2006, soil water characteristics: https://doi.org/10.2136/sssaj2005.0117
- USDA-NRCS Soil Health: https://www.nrcs.usda.gov/conservation-basics/natural-resource-concerns/soil/soil-health
- USDA-NRCS Conservation Crop Rotation, Practice Standard 328: https://www.nrcs.usda.gov/sites/default/files/2022-09/Conservation_Crop_Rotation_328_CPS.pdf
- Pakistan Journal of Botany, chickpea nitrogen: https://www.pakbs.org/pjbot/paper_details.php?id=321
- IAEA INIS, mungbean nitrogen: https://inis.iaea.org/records/av3bf-rn338
- Zagazig Journal of Agricultural Research, berseem nitrogen: https://zjar.journals.ekb.eg/article_297652_75ab256d516da61ad01cec7147f73c95.pdf

**Maps and geocoding**
- OpenStreetMap: https://www.openstreetmap.org/copyright
- Nominatim geocoding: https://nominatim.org/
- Photon geocoder (Komoot): https://photon.komoot.io/
- Esri ArcGIS basemaps (World Imagery, Street Map): https://www.arcgis.com/

**Platforms**
- Supabase: https://supabase.com/
- PostGIS: https://postgis.net/
- Google Earth Engine: https://earthengine.google.com/

**Code libraries**
- FastAPI: https://fastapi.tiangolo.com/
- React: https://react.dev/
- Vite: https://vite.dev/
- Tailwind CSS: https://tailwindcss.com/
- Leaflet: https://leafletjs.com/
- Recharts: https://recharts.org/
- TanStack Query: https://tanstack.com/query
- Zustand: https://github.com/pmndrs/zustand
- lucide-react icons: https://lucide.dev/
- pandas: https://pandas.pydata.org/
- NumPy: https://numpy.org/
- SciPy: https://scipy.org/
- rasterio: https://rasterio.readthedocs.io/

**Fonts:** Google Fonts (Fraunces, Plus Jakarta Sans, Noto Nastaliq Urdu, Noto Naskh Arabic): https://fonts.google.com/

**Demo production**
- Piper TTS (voice-over): https://github.com/rhasspy/piper
- FFmpeg: https://ffmpeg.org/
- Playwright: https://playwright.dev/

**AI assistance:** Claude Code (Anthropic): https://www.anthropic.com/claude-code

> ⚠️ Add the source URL of `frontend/public/backgrounds/farm-valley.jpg` here, or replace the photo.

---

## 4. How the project meets the challenge

| Challenge requirement | How Field Triage meets it |
|---|---|
| Combine NASA Earth observations with local soil, crop and farmer data | NASA POWER (8 parameters) + MODIS NDVI, plus SoilGrids soil, Copernicus DEM slope, a 75-crop catalog and the farmer's own limits |
| Compare at least 3 rotation strategies, including the current one | Every rotation in the province is scored (36 in Punjab). The shortlist shows the current rotation ("Your current") plus the best water-saving, soil-building, income and conventional option. "Show all" lists the rest. |
| Explain why each was suggested | Shortlist reason ("Best water-saving option for your field") and a "Why this rotation" summary |
| Supporting evidence | Evidence explorer grouped as Climate / Water / Soil / Land / Crops / Market / Your farm, each item with a source link |
| Benefits | "What it does well" cards (water saved, nitrogen added, living-root months, pest break, income) |
| Information gaps | Gaps (missing months, soil or terrain unavailable, ETo fallback, borrowed crop calendar, income not compared) |
| Risks needing local review | "What to watch" cards (heat, frost and water failures, bare months, same-family crops) and farm checks (soil test, sowing dates, water supply, agronomist) |
| Farmer priorities | Goals in order (converted to weights), water available, income needed, bad seasons accepted, equipment not available |
| Temperature, heat stress, frost, rainfall, extreme rain | T2M_MAX / T2M_MIN / PRECTOTCORR → heat days at every degree 24–49 °C, frost days ≤ 0 °C, heavy-rain days ≥ 25 mm, dry spells |
| Soil moisture, evaporation, vegetation stress | POWER GWETROOT, FAO-56 ETo, MODIS NDVI (observed bare months, latest greenness), SMAP for the pilot field |
| Long-term trends | Rain and temperature trend per decade; score range across past years |
| Bare-field periods, seasons when crops are vulnerable | "Your farm's year" strip: bare months, heat at flowering, frost, dry and heavy-rain months, plus key moments |
| Rotations that break pest cycles, cut water demand | Pest-break score by plant family (NRCS 328); water need and irrigation gap per season vs the current rotation |
| Nitrogen fixation, cover, deep-rooting, drought-tolerant crops | Cited legume nitrogen (kg N/ha and bags of urea), cover crops, root depth and drought tolerance in the catalog |
| Interactive map, field zones, scenario sliders | Leaflet map with satellite layer and field drawing; field erosion-risk map; rainfall and warming "what if" |
| Explain terms; satellite vs ground; uncertainty | Glossary tooltips (ETo, NDVI, root-zone wetness, aridity…); "Satellite vs ground" card; confidence level; 10th–90th percentile range; data-quality badges |
| Farmer-friendly, supports local expertise | Plain words, Urdu with right-to-left layout, mobile layout, a disclaimer on every result |
| Harmonize different resolutions | Everything is reduced to one point and one calendar month: ~50 km POWER cell, 250 m SoilGrids and MODIS pixels, ~330 m DEM window |

---

## 5. System architecture and request flow

```mermaid
flowchart LR
  U[Farmer's browser<br/>React app, EN / Urdu] -->|search| GEO[Photon / Nominatim]
  U -->|sign in, save fields| SB[(Supabase<br/>Postgres + PostGIS + Auth)]
  U -->|POST /api/v1/locations/compare| API[FastAPI backend]
  U -->|GET /locations/ndvi poll| API
  API --> PR[Province resolver<br/>regions.json + Nominatim reverse]
  API --> PH[NASA POWER Daily API<br/>2005 → today]
  API --> MO[MODIS MOD13Q1 NDVI<br/>ORNL → AppEEARS]
  API --> SG[ISRIC SoilGrids v2.0]
  API --> DEM[Copernicus DEM GLO-30]
  API --> CAT[(Catalog JSON<br/>75 crops, 54 rotations,<br/>parameters, FAOSTAT)]
  PH --> AG[Agromet: FAO-56 ETo,<br/>USDA-SCS rain, Saxton-Rawls]
  SG --> AG
  AG --> ENG[Rotation engine<br/>season replay, scores,<br/>limits, shortlist]
  MO --> ENG
  DEM --> ENG
  CAT --> ENG
  ENG --> FY[Farm year + key moments]
  ENG --> EXP[Explain: insights,<br/>evidence, gaps, checks]
  FY --> API
  EXP --> API
  subgraph Offline pipeline (M1, pilot field)
    EE[Google Earth Engine] --> SMAP[SMAP L4 SPL4SMGP v008]
    EE --> MOD[MODIS MOD13Q1 v061]
    PW[NASA POWER] --> INT[integrate_nasa_data.py]
    SMAP --> INT
    MOD --> INT
  end
```

| Module | Owner | Role | Folder |
|---|---|---|---|
| Data pipeline | M1 | NASA extraction, integration and validation | `pipeline/`, `data/raw/`, `data/processed/` |
| Backend | M2 | API, live data, agromet, engine, MODIS NDVI, farm year, explanations | `backend/` |
| Crop catalog | M3 | Crops, rotations, provinces, parameters, market data | `data/*.json`, `backend/scripts/build_market_data.py` |
| Frontend | M4 | React web app, accounts, field drawing, Urdu | `frontend/` |
| Database | — | Supabase schema and security policies | `supabase/migrations/` |
| Demo | — | Videos and slides | `submission/` |

**Request flow for one analysis**

1. The browser sends `{location, irrigation, current_rotation_id, priorities, scenario, constraints}`.
2. The backend resolves the province. It checks the `regions.json` rectangles; where rectangles overlap, it asks OpenStreetMap reverse geocoding for the province name; points outside every province get HTTP 422 and are never assigned to the nearest one.
3. It loads the POWER history for the 0.5° cell (cache, or a live call), and SoilGrids and DEM values for the point (cached 30 days).
4. MODIS NDVI: if this 250 m pixel is cached, it is merged into the profile; otherwise a background download starts, and the page polls `GET /locations/ndvi` and re-runs the comparison when it is ready.
5. It builds the field profile: monthly rain, temperatures, heat and frost days, heavy-rain days, ETo and climatology.
6. The engine scores every rotation in the province, applies the farmer's limits, builds the shortlist and the farm year; the explain module adds the text.
7. The response holds the ranked rotations, data quality, sources used, warnings, the NDVI status and the "right now" status.

---

## 6. Frontend: pages and navigation

### 6.1 Routes

| Route | Page | What it shows |
|---|---|---|
| `/` | Overview | "Find better crop rotations". Map with search, Map/Satellite toggle and "Use my device location". Clicking the map or a search result opens a pin card with the region and **Analyze this location**. Guests see a "Create account" call to action; signed-in users also see their saved fields on the map with total area. |
| `/location?lat&lon[&field&name&area_ha&irrigation&rotation&equip]` | Location analysis | Left: "About your field" (current rotation, irrigation, Analyze) and "About your farm" (water, income, bad seasons, equipment, goal order, weather "what if"). Right: results, with a sticky section bar **Summary · Year · Compare · Details · Climate · Site · Data**. |
| `/account` | Account | Sign up, sign in, sign out (Supabase email/password) |
| `/my-fields` | My fields | Field cards with shape preview, area (ha, acres, m²), perimeter, **Analyze** and **Edit** |
| `/my-fields/new`, `/my-fields/:id` | Field editor | 3 steps: 1. find your area (search or GPS); 2. mark the field (free shape, rectangle or circle, draggable points, live measurements); 3. about this field (name, address, current crop, irrigation, water source, equipment not available). Guests see "Sign in to add fields". |
| `/methodology` | Methodology | Every formula and source in plain language |
| `/fields/:fieldId` | Pilot field | Demo pilot fields (mock data) |

### 6.2 Results sections on the analysis page

| Section | Components | Content |
|---|---|---|
| Summary | `RecommendationHero`, `KpiGrid` | Best fit for this location, overall score and range, component scores and change vs the current rotation; rain, ETo, aridity, water shortfall, growing heat, dry spell, root-zone wetness, warming trend |
| Year | `FarmYearCard`, `FarmYearStrip` | "Your farm's year": current rotation vs a chosen alternative, month by month (crop, stage, bare soil, heat/frost/dry/heavy-rain risk as Low/Some/High), key moments, NDVI download status |
| Compare | `RotationLeaderboard`, `ScoreRadar`, `WaterBalanceChart` | Shortlist with rank, overall score and range bar, Water/Soil/Resilience; "Show all N rotations"; "doesn't fit your farm because…" |
| Details | `RotationDetail`, `InsightAccordion`, `EvidenceExplorer` | Tabs: Benefits and risks · Gaps and farm checks · Evidence, every line with a source chip |
| Climate | `ClimatePanel` | Rain vs crop-water demand, temperature through the year |
| Site | `FieldRiskMap`, `SiteConditions`, `NowPanel` | Erosion risk on the field, soil, terrain, current conditions (favourable / watch / stressed) |
| Data | `DataSourcesPanel`, `SatelliteVsGround` | Data quality, only the sources actually used, satellite vs ground explainer |

### 6.3 Shell and navigation behaviour

- **Layout** (`components/shell/AppShell.tsx`):
  - ≥ 1280 px: a 256 px glass sidebar with the brand, navigation, account box and disclaimer card.
  - 768–1279 px: an 80 px icon rail with tooltips.
  - < 768 px: a 56 px top header and a 64 px bottom navigation bar.
- **Navigation items:** Overview, then **Sign in** for guests or **My fields** for signed-in users, then Methodology. Guests also get a "Create account to save your fields" box.
- **Language:** an "EN | اردو" switcher in the sidebar, rail and phone header. Urdu switches the page to `dir="rtl"`; logical CSS properties move the sidebar to the right. Headings use Noto Nastaliq Urdu and body text Noto Naskh Arabic. Untranslated strings fall back to English.
- **Accessibility:** a skip link is the first tab stop; focus moves to the page title on route change; reduced motion is respected; no horizontal scroll at phone width.
- **State:** TanStack Query for server data; Zustand for app state, auth and farm inputs (saved in the browser).

---

## 7. Technology stack

### 7.1 Languages

Python 3.12.3 · TypeScript 7 · SQL (PostgreSQL / PostGIS) · HTML / CSS · JavaScript (Node.js 24 tooling)

### 7.2 Backend (`backend/requirements.txt`, installed versions)

| Package | Version | Used for |
|---|---|---|
| FastAPI | 0.163.0 | REST API, OpenAPI docs at `/docs` |
| Uvicorn | 0.54.0 | ASGI server |
| Pydantic | 2.14.3 | Request and response contract (`app/models/schemas.py`) |
| httpx | 0.28.1 | Calls to NASA POWER, AppEEARS, ORNL, SoilGrids, Nominatim |
| pandas | 3.1.1 | Daily-to-monthly aggregation |
| NumPy | 2.5.4 | Numerical work, percentiles |
| SciPy | 1.18.1 | Slope plane fit, statistics |
| rasterio | 1.5.2 | Reading Copernicus DEM Cloud-Optimized GeoTIFFs |
| pymannkendall | 1.4.3 | Trend tests |
| pyarrow | 26.0.1 | Columnar data files |
| python-dotenv | 1.2.4 | `.env` settings |
| pytest | 9.2.0 | 101 automated tests |

### 7.3 Frontend (`frontend/package.json`, installed versions)

| Package | Version | Used for |
|---|---|---|
| React / React DOM | 19.3.1 | UI |
| TypeScript | 7.0.2 | Type safety |
| Vite | 8.3.8 | Dev server and build |
| Tailwind CSS + @tailwindcss/vite | 4.3.5 | Styling (dark-green glass theme) |
| React Router | 7.18.5 | Pages |
| TanStack Query | 5.107.1 | Server data and caching |
| Zustand | 5.1.0 | App, auth and farm-input state |
| Leaflet / react-leaflet | 1.9.4 / 5.0.0 | Maps, field drawing, erosion map |
| Recharts | 3.10.1 | Charts |
| @supabase/supabase-js | 2.119.0 | Accounts and saved fields |
| lucide-react | 1.73.0 | Icons |
| oxlint | 1.93.0 | Linting |
| Google Fonts | — | Fraunces, Plus Jakarta Sans, Noto Nastaliq Urdu, Noto Naskh Arabic |

### 7.4 Data pipeline (`pipeline/requirements.txt`)

`earthengine-api` (SMAP and MODIS via Google Earth Engine), `earthaccess` (NASA Earthdata), `h5py`, `xarray`, `netCDF4`, `requests`, `tqdm`, `pandas`, `numpy`, `pyarrow`, `pymannkendall`.

### 7.5 Database, platforms and services

Supabase (PostgreSQL + PostGIS, Row-Level Security, email auth) · Google Earth Engine · NASA AppEEARS and Earthdata Login · NASA POWER API · ISRIC SoilGrids API · Copernicus DEM on AWS Open Data · OpenStreetMap Nominatim and Photon · Esri ArcGIS basemaps.

### 7.6 Development and demo tools

| Tool | Used for |
|---|---|
| VS Code, Git, GitHub | Editing, version control, hosting |
| Claude Code (Anthropic) | AI coding assistant (see §19) |
| Playwright | Browser checks and screen captures |
| Piper TTS (`en_US-ryan-high` voice, runs locally) | Demo voice-over |
| FFmpeg (via `imageio-ffmpeg`) | Video assembly |
| pptxgenjs + Microsoft PowerPoint | Slides and PDF export |

**Hardware:** none. The app runs in any modern browser on phone or desktop.

---

## 8. NASA data used

### 8.1 NASA POWER (core, live, every analysis)

- **Provider:** NASA Langley Research Center, POWER project.
- **API:** `GET https://power.larc.nasa.gov/api/temporal/daily/point` with `community=AG`, the 0.5° cell centre, `start=20050101`, `end` = today minus about 5 days, `format=JSON`. No key needed.
- **Underlying sources:** meteorology from NASA GMAO MERRA-2; solar radiation from NASA CERES.
- **Code:** `backend/app/services/power_history.py`, `power_live.py`, `m1_profile.py`, `agromet.py`.

| Parameter | Meaning | Unit | How we use it |
|---|---|---|---|
| `PRECTOTCORR` | Precipitation, bias-corrected | mm/day | Monthly rain, effective rain, heavy-rain days ≥ 25 mm, dry spells, 14-day "now" rain, trend, rainfall scenario |
| `T2M` | Mean air temperature, 2 m | °C | Monthly mean, warming scenario, trend |
| `T2M_MAX` | Daily maximum temperature | °C | Heat days at every degree 24–49 °C (heat at flowering), ETo, current heat |
| `T2M_MIN` | Daily minimum temperature | °C | Frost days ≤ 0 °C, ETo |
| `RH2M` | Relative humidity | % | Vapour pressure for Penman-Monteith ETo |
| `WS2M` | Wind speed, 2 m | m/s | Penman-Monteith ETo |
| `ALLSKY_SFC_SW_DWN` | All-sky surface shortwave irradiance | MJ/m²/day | Net radiation for ETo |
| `GWETROOT` | Root-zone soil wetness (0 dry – 1 saturated) | 0–1 | Evidence and "right now" checks |

**Caching:** one file per 0.5° cell in `data/cache/power/`. The historical part is never fetched again; after 24 h only the last 30 days are refreshed. If NASA is unreachable, stale cached data is used and flagged. One lock per cell prevents duplicate requests.

### 8.2 MODIS NDVI per field (live, background)

| Item | Value |
|---|---|
| Product | MODIS/Terra Vegetation Indices 16-Day L3 Global 250 m, **MOD13Q1 v061** |
| Providers, in order | 1. ORNL DAAC MODIS Web Service (no login; reachability probed and remembered 30 min) → 2. NASA AppEEARS point request (free Earthdata login in `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD`; asynchronous, resumes a submitted task) → 3. none: the crop-calendar estimate is kept and the app says so |
| Quality filter | Only pixel reliability 0 (good) and 1 (marginal); snow, cloud and fill values are dropped, never turned into zero |
| Outputs | Monthly NDVI, 12-month climatology, observed bare days (NDVI < 0.2), latest value |
| Cache | On disk per ~250 m pixel, so the slow fetch happens once per field |
| Endpoint | `GET /api/v1/locations/ndvi` reports `ready`, `running`, `failed`, `not_configured` or `disabled` |
| Code | `backend/app/services/modis_ndvi.py`, `frontend/src/hooks/useNdviPolling.ts` |

### 8.3 SMAP L4 (pilot field, offline pipeline)

| Item | Value |
|---|---|
| Product | SMAP L4 Global 3-hourly 9 km Surface and Root-Zone Soil Moisture, **SPL4SMGP v8** |
| Access | Google Earth Engine collection `NASA/SMAP/SPL4SMGP/008` (`pipeline/extract_smap.py`) |
| Bands | `sm_surface` (0–5 cm), `sm_rootzone` (0–100 cm), m³/m³ |
| Processing | Daily mean of the eight 3-hourly images; pilot point 33.7908 N, 72.6625 E; 2015-03-31 to 2026-11-10 |
| Used for | Pilot field profile: monthly root-zone soil moisture, "now" dryness check (dry below 0.15 m³/m³) |

The pilot file `data/processed/F01/F01_nasa_integrated_daily.csv` combines POWER, SMAP and MODIS daily: `date, PRECTOTCORR, T2M, T2M_MAX, T2M_MIN, RH2M, ALLSKY_SFC_SW_DWN, sm_surface, sm_rootzone, n_images, NDVI, EVI, SummaryQA, MODIS_composite_date`.

### 8.4 NASA datasets reviewed but not used

GPM IMERG, ECOSTRESS, Landsat, GRACE/GRACE-FO, SRTM and GEDI are listed in `data/nasa_metadata.json` as future or context sources. Copernicus DEM was chosen over SRTM because it has public cloud-optimized tiles with no login.

---

## 9. Space Agency Partner data and other data

| Source | Organisation | What we use | How |
|---|---|---|---|
| **Copernicus DEM GLO-30** | **ESA** / EU Copernicus (Space Apps 2026 partner) | `elevation_m`; `slope_deg` from a least-squares plane over 11 × 11 pixels (~330 m) | Public Cloud-Optimized GeoTIFFs on AWS, read with rasterio, no credentials. Slope feeds the erosion score and field erosion map. |
| **ISRIC SoilGrids v2.0** | ISRIC World Soil Information | `clay`, `sand` (%), `soc` (g/kg), `phh2o`; depth-weighted 0–30 cm | REST query; if the point is masked (city or water) the nearest valid pixel within 300 m is used and the offset reported. Feeds texture, Saxton-Rawls water holding and pH checks. |
| **FAOSTAT** | UN FAO | National yield (kg/ha) and producer price (USD/t) | Bulk downloads processed by `backend/scripts/build_market_data.py` into `data/market_faostat.json`; mean of the latest 3 years; values older than 5 years rejected |
| Crop parameters | FAO-56, FAO EcoCrop, FAO GAEZ v4 | Kc, growth-stage fractions, heat thresholds, water need, root depth, drought tolerance | `data/crops.json` |
| Legume nitrogen | Pakistan J. Bot., IAEA INIS, Zagazig J. Agric. Res. and other cited studies | Conservative "left for the next crop" kg N/ha with field ranges | `data/crops.json`, with source URLs |
| Crop calendars | Provincial sowing and harvest months (M3) | Sow and harvest month per province; missing ones borrow a neighbour's and are flagged | `data/crops.json` (`calendars`), `data/regions.json` (fallback chains) |
| Equipment needs | Team estimate, marked illustrative | Seed drill, combine harvester, rice transplanting, picking labour, orchard commitment, daily market access | `data/parameters.json` (`equipment_needs`) |
| OpenStreetMap | OSM contributors (Nominatim, Photon) | Address → coordinates; province name from reverse geocoding | §10 |
| Esri ArcGIS basemaps | Esri | World Imagery, World Street Map, Dark Gray Canvas | Map backgrounds |

---

## 10. External APIs and services

| Name | URL | Auth | Called from | Purpose | Limits and handling |
|---|---|---|---|---|---|
| NASA POWER Daily Point API | `https://power.larc.nasa.gov/api/temporal/daily/point` | None | Backend | 20+ years of daily weather | 60 s timeout; cell cache; stale fallback; HTTP 503 if no cache |
| ORNL DAAC MODIS Web Service | `https://modis.ornl.gov/` | None | Backend `modis_ndvi.py` | MODIS NDVI | Short probe; result remembered 30 min |
| NASA AppEEARS | `https://appeears.earthdatacloud.nasa.gov/` | Earthdata login | Backend `modis_ndvi.py` | MODIS NDVI point extraction | Background task; retries; resumes submitted tasks |
| ISRIC SoilGrids REST v2.0 | `https://rest.isric.org/soilgrids/v2.0/properties/query` | None | Backend `location_data.py` | Soil | 12 s timeout; cached 30 days |
| Copernicus DEM GLO-30 (AWS) | `https://copernicus-dem-30m.s3.amazonaws.com/` | None | Backend `location_data.py` | Elevation and slope | Cached 30 days |
| Nominatim (OSM) | `https://nominatim.openstreetmap.org/` | None | Backend `/geocode`, `admin_region.py` | Address search; province reverse geocoding | 1 request/s; disk and memory cache; generic User-Agent `FieldTriage/1.0` |
| Photon (Komoot) | `https://photon.komoot.io` | None | Frontend `lib/geo/geocode.ts` | Map search suggestions | Keyless |
| Esri ArcGIS tiles | `https://server.arcgisonline.com/` | None | Frontend maps | Satellite and street tiles | Attribution on the map |
| Supabase | Project URL + publishable key | Email/password | Frontend `lib/supabase.ts`, `api/account.ts` | Accounts and saved fields | Row-Level Security |
| FAOSTAT bulk download | `https://bulks-faostat.fao.org/production/` | None | Offline script | Yield and price | Run manually |
| Google Earth Engine | `earthengine-api` | Google project | Offline `pipeline/` | SMAP and MODIS for the pilot field | Not used by the live app |

---

## 11. Backend REST API reference

Base URL: `http://localhost:8000/api/v1`. Interactive docs: `http://localhost:8000/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{"status":"ok","service":"field-triage","data_mode":…}` |
| GET | `/regions` | Supported provinces (Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan) |
| GET | `/locations/region?lat&lon` | Province for a point and its rotations (422 if unsupported) |
| GET | `/locations/data?lat&lon` | SoilGrids and DEM for any point (rate-limited) |
| GET | `/locations/ndvi?lat&lon[&start]` | MODIS NDVI status; includes the per-pixel summary when ready |
| POST | `/locations/compare` | **Main analysis:** rank rotations for a point |
| GET | `/rotations?region_id=` | Rotation catalog |
| GET | `/crops` | Crop catalog |
| GET | `/meta/sources` | Data-source metadata |
| GET | `/geocode?q=` | Address search (Nominatim proxy, at most 5 results) |

**`POST /locations/compare` request**

```json
{
  "location": {"lat": 31.42, "lon": 73.08},
  "irrigation": "limited",
  "current_rotation_id": "rot_pk_rice_wheat",
  "priorities": {"w_water": 0.4, "w_soil": 0.3, "w_income": 0.2, "w_resilience": 0.1},
  "scenario": {"rain_multiplier": 1.0, "temp_delta_c": 0.0},
  "constraints": {
    "water_available_mm": 300,
    "min_income_usd_ha": 800,
    "max_bad_seasons_in_10": 2,
    "unavailable_equipment": ["rice_transplanting"]
  },
  "rotation_ids": null
}
```

- `irrigation`: `none`, `limited` or `reliable` (0, 200 or 800 mm per season). When `water_available_mm` is given, it replaces the tier amount.
- `priorities` must sum to 1 (the frontend converts the goal order to 0.4 / 0.3 / 0.2 / 0.1).
- `scenario.rain_multiplier` is 0.6–1.4 and `temp_delta_c` is 0–4.
- `constraints` are all optional; `null` means "not given" and is never treated as zero. `unavailable_equipment` takes `seed_drill`, `combine_harvester`, `rice_transplanting`, `picking_labour`, `orchard_commitment`, `daily_market_access`. The frontend converts real units (inches, acre-feet, m³, tubewell hours × L/s, canal turns × hours × cusecs, PKR per acre) before sending.
- `current_crop` can replace `current_rotation_id`; if the crop is in several rotations, one is picked deterministically and a "change if wrong" warning is returned.

**Response (main fields):** `rotations[]` with `rank`, `is_existing`, `overall`, `overall_low`, `overall_high`, `scores`, `components`, `why`, `insights[]`, `evidence[]`, `confidence`, `annual_value_usd_ha`, `shortlisted`, `shortlist_reason`, `fits_constraints`, `constraint_failures[]`, `farm_year[12]`, `key_moments[]`, `mean_water_need_mm`, `mean_irrigation_gap_mm`; plus `total_candidates`, `constraints_applied`, `income_status`, `data_quality`, `sources`, `location`, `warnings[]`, `data_retrieval` (including `ndvi`), `now` status and `disclaimer`.

**Errors** (always `{"detail": "..."}`): 422 invalid input or unsupported point · 429 rate limit (10 uncached analyses per minute per client) · 503 NASA unreachable with no cache · 500 unexpected (logged, not returned).

---

## 12. Science and scoring method

All tunable numbers live in `data/parameters.json` and are marked not field-validated, so confidence never reaches HIGH.

### 12.1 Season check (each crop, each past year)

| Step | Rule | Source |
|---|---|---|
| Season window | Crop's sow and harvest months for the province; winter crops cross the year boundary | Provincial calendars |
| Growth stages | FAO-56 four stages (initial, development, mid, late) with Kc per stage | FAO-56 Tables 11–12 |
| Reference ET | Penman-Monteith (FAO-56 eq. 6) daily; Hargreaves (eq. 52) on days without radiation, humidity or wind | Allen et al. 1998 |
| Crop water demand | Σ months (Kc × ETo) | FAO-56 |
| Effective rain | USDA-SCS monthly method × rainfall scenario | USDA-SCS / FAO CROPWAT |
| Soil water | Saxton-Rawls (2006) field capacity minus wilting point × root depth (max 150 cm) × 0.5 | Saxton & Rawls 2006 |
| Supply | Effective rain + soil water + irrigation | — |
| Water OK | Supply ≥ f × demand, f from drought tolerance (1 → 0.75 … 5 → 0.45) | Parameter |
| Heat OK | Heat days above the crop's threshold, counted **only at flowering**, ≤ tolerated days; thresholds shift with warming | FAO EcoCrop |
| Frost OK | A frost-sensitive crop fails with ≥ 1 weighted frost day from development to mid-season | Parameter |
| Viable | Heat OK **and** frost OK **and** water OK | — |
| Missing data | A season with any missing month is excluded, never counted as zero | Honesty rule |

### 12.2 Scores (0–100)

| Score | Formula |
|---|---|
| Resilience | 100 × viable seasons ÷ complete seasons |
| Water | 100 × (1 − min(mean seasonal deficit ÷ 500 mm, 1)) |
| Soil health | 100 × (0.5 × living-root share + 0.5 × min(legume net N ÷ 100 kg/ha, 1)) |
| Erosion | 100 × (1 − bare fraction × (1 + slope°/10) × clip(heavy-rain days ÷ 3, 0.2, 1)); MODIS-observed bare days replace the calendar estimate for the current rotation when available |
| Pest break | Mean over consecutive crop pairs: 100 for a different plant family, 20 for the same (NRCS 328) |
| Soil | 0.5 × soil health + 0.3 × erosion + 0.2 × pest break |
| Crop value (USD/ha/yr) | Σ crops (FAOSTAT yield × price × viable share) ÷ cycle years; null if any crop lacks current data |
| Income | 100 × crop value ÷ best crop value; scored only if every rotation has a value, otherwise removed and the other weights renormalised |
| Overall | Σ weight × score with the farmer's weights |
| Range | Overall recomputed per past year; 10th and 90th percentiles |
| Ranking | Highest overall first; ties: current rotation, then higher resilience, then ID |

### 12.3 Farmer limits

Limits never change scores or rank. They set `fits_constraints` and the shortlist, and each failure becomes a plain sentence:
- **Water:** a rotation fails when any crop's average irrigation need to reach its minimum viable share exceeds `water_available_mm`.
- **Income:** fails when known expected crop sales are below `min_income_usd_ha`. Unknown income never fails; it is reported as a gap.
- **Bad seasons:** fails when (non-viable ÷ checked seasons) × 10 exceeds `max_bad_seasons_in_10`.
- **Equipment:** fails when any crop needs a listed item (`equipment_needs`, crop entries override type entries).

### 12.4 Deterministic shortlist

Every rotation in the province is scored and ranked. The current rotation is always shortlisted. Then, for each strategy in the fixed order water-saving, soil-building, income, conventional, the best-ranked rotation of that type that fits the farmer's limits (and is not already listed) is added as "Best <type> option for your field". A type with no fitting rotation is skipped. The rest appear under "Show all".

### 12.5 Farm year

`farm_year.py` folds each rotation onto the 12 calendar months. For each month it gives the crops, the main crop's stage (sowing, growing, flowering, harvest), whether the field is bare, and the share of past years with heat, frost, dry or heavy-rain risk. It also flags an erosion alert (bare and heavy rain likely), observed NDVI and "opportunity" months (bare, but not too hot, cold or dry, so a short or cover crop could fit). Two or three plain "key moments" sentences summarise it. It is pure and deterministic.

### 12.6 Confidence and "right now"

- **Confidence:** coverage = share of the evidence pillars (power, smap, modis, soil, terrain) with real observations. HIGH needs coverage ≥ 0.8, ≥ 10 years and validated parameters; MEDIUM needs ≥ 0.5; otherwise LOW.
- **Right now:** the latest POWER days are classed FAVORABLE, WATCH or STRESSED (dry below 5 mm in 14 days; heat watch 35 °C, stress 40 °C; root-zone dry; low NDVI below 0.25 where available).

---

## 13. Crop and rotation catalog

- **75 crops** in `data/crops.json` (cereals, pulses, oilseeds, fodder, fibre, vegetables, fruit), each with plant family, heat threshold and tolerated heat days, frost sensitivity, water need, FAO-56 Kc and stage fractions, root depth, drought tolerance, cited legume nitrogen and provincial calendars.
- **54 rotations** in `data/rotations.json`:

| Province | Rotations | Strategy types (whole catalog) |
|---|---|---|
| Punjab | 36 | Income 21 |
| Sindh | 9 | Soil-building 15 |
| Khyber Pakhtunkhwa | 6 | Water-saving 10 |
| Balochistan | 3 | Conventional 8 |

- **Provinces** (`data/regions.json`): approximate rectangles with province names and calendar fallback chains. Where rectangles overlap, the province comes from OpenStreetMap reverse geocoding (cached per ~1 km), with a deterministic fallback that is flagged.
- **Example result** (live, 15 Nov 2026, Faisalabad 31.42 N 73.08 E, current Rice – Wheat, limited irrigation): Pearl Millet – Chickpea ranked 1 of 36 with 82/100 (range 76–88), 49 points above the current rotation (33/100), with about 314 mm less water shortfall per season.

---

## 14. Explanations: benefits, risks, gaps, checks, evidence

`backend/app/services/explain.py` is rule-based and does not use AI. Every statement is computed from this location's numbers and carries a `source_url`.

| Kind | Example | Typical source |
|---|---|---|
| Why | "Scores 49 points above your current Rice – Wheat with your priorities and the 20-year NASA record for this point." | Engine |
| Benefit | "Needs less water than your current rotation: about 314 mm less shortfall per season." "Chickpea leaves about 50 kg of nitrogen per hectare, roughly 2.2 bags of urea." | NASA POWER + FAO-56; Pakistan J. Bot. |
| Risk | "Field left bare for about 3 months." "Too hot at flowering in N of 22 seasons." | Crop calendar + USDA-NRCS; NASA POWER |
| Gap | "Income not compared: no recent FAOSTAT price for …" "Crop calendar borrowed from a neighbouring province." | Data status |
| Check | "Confirm sowing dates locally." "Get a soil test." "The climate cell is about 50 km wide." "Ask an agronomist before switching." | Extension guidance |
| Evidence | Grouped values (Climate, Water, Soil, Land, Crops, Market, Your farm) with label, value, unit, source and interpretation | All of the above |

---

## 15. User accounts and saved fields (Supabase)

- **Auth:** Supabase email and password. The browser holds only the project URL and publishable key; the service-role key is never used in the app.
- **Table `public.fields`** (`supabase/migrations/0001_user_fields.sql`): `id`, `user_id` (default `auth.uid()`), `name`, `address`, `shape_type` (polygon / rectangle / circle), `geojson`, `radius_m`, `geom` (PostGIS geography), `center_lat`, `center_lon`, `area_m2`, `perimeter_m`, `irrigation`, `current_rotation_id`, `details` (jsonb), timestamps. Migration `0002_field_equipment.sql` adds the equipment the farmer does not have (optional; the app works without it).
- **Trigger `fields_measure`:** validates geometry, computes area and perimeter on the server (circles use π r²), allows 10 m² to 5,000 ha and at most 200 fields per user, and blocks owner changes.
- **Security:** Row-Level Security policies for select, insert, update and delete, each `user_id = auth.uid()`; anonymous access revoked.
- **In-browser measuring** (`frontend/src/lib/geo/measure.ts`): spherical polygon area (Chamberlain–Duquette, JPL 07-03), haversine side lengths, self-intersection check, 64-point circles.

---

## 16. Data quality, honesty rules and limitations

**Rules built into the code**
- Null means "no observation"; missing values are never turned into 0.
- Cards, tiles and evidence rows with no data are hidden.
- Only sources actually used are listed.
- Income is scored only from current official FAOSTAT data; otherwise "not compared", with the reason.
- Points outside the supported provinces are refused, never mapped to the nearest one.
- Every result is labelled historical suitability, not a forecast, with "supports, not replaces" messaging.

**Known limitations**
1. POWER is a ~0.5° (~50 km) grid, not a field sensor.
2. SMAP is used for the pilot field only. MODIS NDVI per field needs an Earthdata login on the server; without it the calendar estimate is used and labelled.
3. Pakistan only (4 provinces); provinces are approximate rectangles refined by reverse geocoding; 13 crop calendars are borrowed from neighbouring provinces and flagged.
4. Parameters (thresholds, weights, equipment needs) are literature-based or illustrative and not field-validated, so confidence is capped at MEDIUM.
5. FAOSTAT yields and prices are national averages; some crops have no recent price.
6. SoilGrids is a 250 m model, not a lab test; the DEM includes buildings and trees.
7. Pest break uses plant family only.
8. The frontend has no automated unit tests; it was checked by type-checking, production build and browser runs. Urdu translation of some analysis panels is still partial (falls back to English).

---

## 17. Installation, running and testing

**Requirements:** Python 3.12+, Node.js 20+ (developed on Node 24).

```bash
# Backend
cd backend
python -m venv .venv
.venv/Scripts/activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000      # docs: http://localhost:8000/docs

# Frontend (new terminal)
cd frontend
npm install
cp .env.example .env.local        # VITE_USE_MOCK=false, VITE_API_URL=http://localhost:8000,
                                  # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (publishable key)
npm run dev                       # http://localhost:5173
```

| Optional backend variable | Default / meaning |
|---|---|
| `POWER_HISTORY_START_YEAR` | 2005 |
| `POWER_HISTORY_TTL_HOURS` | 24 |
| `LOCATION_RATE_LIMIT_PER_MINUTE` | 10 |
| `CORS_ORIGINS` | — |
| `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` | Enables MODIS NDVI through NASA AppEEARS |

**Database:** run the files in `supabase/migrations/` in the Supabase SQL editor and enable the Email provider (see `supabase/README.md`).

**Market data refresh (optional):** `python backend/scripts/build_market_data.py`.

**Checks**

```bash
cd backend && python -m pytest -q     # 101 passed (network calls mocked)
python data/validate_data.py          # ALL CHECKS PASSED
cd frontend && npm run build          # type-check and production build
```

---

## 18. Demo assets (videos and slides)

All files are in [`submission/`](submission/). Upload the video to YouTube (unlisted or public) or Google Drive (anyone with the link) and paste that link in the "Project Demo" field.

| File | Length | Use |
|---|---|---|
| `Field_Triage_Global_30s.mp4` | **28.7 s**, 1920 × 1080, 30 fps, AAC stereo | Global judging demo (limit 30 s) |
| `Field_Triage_Local_45s.mp4` | **44.9 s**, with team introduction | Local event |
| `Field_Triage_Slides.pptx` / `.pdf` | **7 slides** | Alternative demo (limit 7) |
| `voiceover_script.json` | — | Narration text per scene |

**How they were made:** real screens of the running app (live analysis for Faisalabad) captured with Playwright, title, team, problem and end cards in the app's design, a local neural voice (Piper, `en_US-ryan-high`), captions on every app scene, assembled with FFmpeg. Each frame shows the label "Real app screens · synthetic voice-over · AI-assisted edit". No NASA logos and no people appear.

**Slides:** 1. Title and team · 2. Problem and users · 3. What we built (3 steps) · 4. NASA and partner data · 5. How it works and the four scores · 6. Live demo result (Faisalabad) · 7. Impact, stack and next steps.

**Global voice-over (28.7 s)**

| Scene | Narration |
|---|---|
| Title card | "Farmers choose a crop rotation for years. But heat, erratic rain and falling water make that choice riskier every season." |
| Find your field | "Field Triage starts with your field, found on a satellite map." |
| Best fit | "It replays twenty years of NASA POWER weather, with soil and slope, through every past season." |
| Compare | "Your current rotation is ranked against the best water saving, soil building and income options." |
| Why, risks and sources | "Every result explains why, with risks and sources." |
| End card | "Field Triage. It supports farmers, and never replaces them." |

**Local voice-over (44.9 s)**

| Scene | Narration |
|---|---|
| Team card | "We are Krypton Knights, solving the Field Shift challenge. Ahmed Jabbar leads the team and the NASA data. Muhammad Naveed Qasim built the backend. Muhammad Safiullah collected local crop data. And Muhammad Tayyab Abdullah Malik designed the app." |
| Problem card | "In Pakistan, a rotation choice lasts years, while heat and water stress keep rising." |
| Find your field | "With Field Triage, a farmer finds their village on a satellite map." |
| Best fit | "We replay twenty years of NASA weather, soil and slope for that exact spot." |
| Compare | "Their rotation is ranked against the best water saving, soil building and income options." |
| Farm year | "A month by month farm year shows bare soil, heat and dry spells." |
| Why, risks and sources | "Every option comes with reasons, risks and sources, in English or Urdu." |
| End card | "Field Triage. Built to support farmers, not replace them." |

---

## 19. Use of AI (Super Intelligence) disclosure

**AI inside the product: none.** The rotation engine is deterministic mathematics, the explanations are rule-based templates filled with computed numbers, and the same input always gives the same result.

**AI used during development**

| Item | Detail |
|---|---|
| Tool | Claude Code, Anthropic's AI coding assistant (Claude Opus family), in VS Code |
| Used for | Writing and refactoring code (backend services, engine, explanations, React components, Supabase SQL), tests, debugging, checking scientific sources, drafting documentation, and editing the demo videos and slides |
| Not used for | The project idea and approach, the NASA data itself, or any runtime decision |
| Human role | The team chose the idea, data sources, science and design, and reviewed and tested all AI-assisted code (101 automated tests, browser checks) |
| Audio and video | The demo voice-over is synthetic (Piper TTS, generated locally). The videos are built from real app screen captures and carry a visible "Real app screens · synthetic voice-over · AI-assisted edit" label. No AI-generated images, and no NASA logos or branding. |

**Suggested text for the SI form field:**

> Yes. We used Claude Code (Anthropic's Claude AI coding assistant) during development to help write and refactor code, write tests, debug, check scientific references, draft documentation and edit the demo. The demo voice-over is a synthetic voice (Piper TTS) and the videos are labelled. The project idea, the choice of NASA data, the scientific method and the design are the team's own, and all AI-assisted code was reviewed and tested by the team (101 automated backend tests). The app itself uses no AI at runtime: scoring is deterministic and explanations are rule-based. No AI-generated images or NASA branding are used.

---

## 20. References

**NASA data and tools**
- NASA POWER: <https://power.larc.nasa.gov/> · Daily API: <https://power.larc.nasa.gov/docs/services/api/temporal/daily/>
- MERRA-2 (NASA GMAO): <https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/>
- CERES (NASA LaRC): <https://ceres.larc.nasa.gov/>
- MODIS MOD13Q1 v061 (LP DAAC): <https://lpdaac.usgs.gov/products/mod13q1v061/>
- NASA AppEEARS: <https://appeears.earthdatacloud.nasa.gov/> · ORNL DAAC MODIS Web Service: <https://modis.ornl.gov/data/modis_webservice.html>
- SMAP L4 SPL4SMGP v008 (NSIDC): <https://nsidc.org/data/spl4smgp/versions/8> · Earth Engine catalog: <https://developers.google.com/earth-engine/datasets/catalog/NASA_SMAP_SPL4SMGP_008>
- NASA Earthdata Login: <https://urs.earthdata.nasa.gov/>
- Chamberlain & Duquette (2007), JPL Publication 07-03: <https://trs.jpl.nasa.gov/handle/2014/41271>

**Space Agency Partner and other data**
- Copernicus DEM GLO-30 (ESA): <https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model> · AWS: <https://registry.opendata.aws/copernicus-dem/>
- ISRIC SoilGrids v2.0: <https://www.isric.org/explore/soilgrids> · API: <https://rest.isric.org/soilgrids/v2.0/docs>
- FAOSTAT: <https://www.fao.org/faostat/en/#data>
- OpenStreetMap: <https://www.openstreetmap.org/copyright> · Nominatim: <https://nominatim.org/> · Photon: <https://photon.komoot.io/>
- Esri ArcGIS basemaps: <https://www.arcgis.com/>

**Science**
- Allen et al. (1998), FAO Irrigation and Drainage Paper 56: <https://www.fao.org/4/x0490e/x0490e00.htm>
- Saxton & Rawls (2006), Soil Sci. Soc. Am. J. 70: 1569–1578: <https://doi.org/10.2136/sssaj2005.0117>
- FAO CROPWAT (USDA-SCS effective rainfall): <https://www.fao.org/land-water/databases-and-software/cropwat/en/>
- USDA-NRCS Soil Health: <https://www.nrcs.usda.gov/conservation-basics/natural-resource-concerns/soil/soil-health>
- USDA-NRCS Practice Standard 328: <https://www.nrcs.usda.gov/sites/default/files/2022-09/Conservation_Crop_Rotation_328_CPS.pdf>
- FAO EcoCrop: <https://gaez.fao.org/pages/ecocrop> · FAO GAEZ v4: <https://gaez.fao.org/>
- Chickpea nitrogen, Pakistan J. Bot.: <https://www.pakbs.org/pjbot/paper_details.php?id=321> · <https://pakbs.org/pjbot/paper_details.php?id=1525>
- Mungbean nitrogen, IAEA INIS: <https://inis.iaea.org/records/av3bf-rn338>
- Berseem nitrogen, Zagazig J. Agric. Res.: <https://zjar.journals.ekb.eg/article_297652_75ab256d516da61ad01cec7147f73c95.pdf>
- Further legume nitrogen sources are cited per crop in `data/crops.json`.

**Software (open source)**
- Backend: FastAPI, Uvicorn, Pydantic, httpx, pandas, NumPy, SciPy, rasterio, pymannkendall, pyarrow, python-dotenv, pytest
- Frontend: React, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, Zustand, Leaflet, react-leaflet, Recharts, supabase-js, lucide-react, oxlint
- Database: Supabase, PostgreSQL, PostGIS
- Pipeline: Google Earth Engine API, NASA earthaccess, xarray, h5py, netCDF4, requests, tqdm
- Fonts: Google Fonts (Fraunces, Plus Jakarta Sans, Noto Nastaliq Urdu, Noto Naskh Arabic): <https://fonts.google.com/>
- Demo: Piper TTS <https://github.com/rhasspy/piper> · FFmpeg <https://ffmpeg.org/> · Playwright <https://playwright.dev/> · pptxgenjs <https://gitbrent.github.io/PptxGenJS/>

**AI assistance:** Claude Code (Anthropic): <https://www.anthropic.com/claude-code>

**Space Apps rules:** Project Submission Guide <https://www.spaceappschallenge.org/resources/project-submission-guide/> · Judging & Awards Guide <https://www.spaceappschallenge.org/resources/judging-awards-guide/>
