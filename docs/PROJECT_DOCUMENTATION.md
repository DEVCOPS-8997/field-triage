# Field Shift Advisor: Project Documentation

**NASA International Space Apps Challenge 2026**
Repository: <https://github.com/DEVCOPS-8997/field-triage> (branch `New-integrated-good-UIUX`)
Document date: 15 November 2026

> **Decision support only.** Field Shift Advisor shows how crop rotations would have performed under 20 years of past NASA weather at a place. It is not a forecast. It does not replace a farmer's judgment, an agronomist, or a soil test.

---

## Contents

1. [Submission checklist (NASA Space Apps 2026)](#1-submission-checklist-nasa-space-apps-2026)
2. [Project name and summary (ready to paste)](#2-project-name-and-summary-ready-to-paste)
3. [Detailed project description (ready to paste)](#3-detailed-project-description-ready-to-paste)
4. [How the project meets the challenge](#4-how-the-project-meets-the-challenge)
5. [System architecture](#5-system-architecture)
6. [Technology stack](#6-technology-stack)
7. [NASA data used (datasets, parameters, attributes)](#7-nasa-data-used-datasets-parameters-attributes)
8. [Space Agency Partner data and other data](#8-space-agency-partner-data-and-other-data)
9. [External APIs and services](#9-external-apis-and-services)
10. [Backend REST API reference](#10-backend-rest-api-reference)
11. [Science and scoring method](#11-science-and-scoring-method)
12. [Crop and rotation catalog](#12-crop-and-rotation-catalog)
13. [Explanations: benefits, risks, gaps, checks, evidence](#13-explanations-benefits-risks-gaps-checks-evidence)
14. [User accounts and saved fields (Supabase)](#14-user-accounts-and-saved-fields-supabase)
15. [Frontend (web app)](#15-frontend-web-app)
16. [Use of Super Intelligence (AI) disclosure](#16-use-of-super-intelligence-ai-disclosure)
17. [Data quality, honesty rules and limitations](#17-data-quality-honesty-rules-and-limitations)
18. [Installation, running and testing](#18-installation-running-and-testing)
19. [Project demo guide (30-second video or 7 slides)](#19-project-demo-guide-30-second-video-or-7-slides)
20. [References](#20-references)

---

## 1. Submission checklist (NASA Space Apps 2026)

Source: the official [2026 Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) and [2026 Judging & Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/) (both dated 13 November 2026).

**Deadline:** Sunday 15 November 2026, 11:59 p.m., in the time zone of the team's Local Event. After that, no edits are allowed.

### 1.1 Project page form fields

| Form field | Required content | Where to find it here |
|---|---|---|
| Project Name | Name of the project | §2 |
| High-Level Project Summary | What we built, how it addresses the challenge, and why it matters | §2 |
| Link to Project Demo | A video of **30 seconds or less**, or a slide deck of **at most 7 slides** (including title and intro slides). Host it publicly (YouTube, Google Drive, GitHub, etc.) with no login. Everything must be in English; a video in another language **must** have English subtitles. | §19 |
| Link to Final Project | Public link to the project (GitHub repo, website, etc.) with no password | The repository URL above (make it public) |
| Detailed Project Description | What it does, how it works, benefits, goals, and the tools, languages, hardware and software used | §3, §5, §6, §11 |
| Use of Super Intelligence (SI) | Whether AI tools were used and how. Collected for data purposes only; judges do not see this answer. | §16 |
| NASA Data | The specific NASA data and resources used. **At least one NASA data source is required for a Global Award.** | §7 |
| Space Agency Partner Data and Other References | Every data source, resource, tool, code library, text and image used, even open source ones | §8, §9, §20 |

### 1.2 Rules to follow

- Projects over the 30-second or 7-slide limit are **not eligible for Global Judging**.
- Images can be uploaded to the project page (JPG, PNG or GIF, up to 10 MB). Videos and documents must be linked.
- Test every link in a private browser window before submitting.
- Demos and projects must not include images, video, audio or any likeness of anyone under 18.
- AI-generated content must not use, contain or modify NASA branding (logos, flags, mission identifiers).
- AI-generated images and videos need a visible watermark. AI-generated code and data must be acknowledged in descriptive text and metadata. See §16.
- All team members must be confirmed at the same Local Event. Teams can have 1 to 6 members (Universal Event teams need at least 2).

### 1.3 Before you press "Submit for Judging"

- [ ] Every required field is filled in, in English.
- [ ] Demo link is public and within the limit (30 s or 7 slides).
- [ ] Repository or final-project link is public.
- [ ] Ticked: "I have read and understand the project submission requirements … and I agree to the Participant Terms and Conditions and Privacy Policy."
- [ ] Ticked: "I confirm that the submitted project represents my team's original work and that all external resources … are listed in the References field …"
- [ ] Pressed **Submit for Judging** and saw the confirmation banner. You can resubmit until the deadline; judges see only the last submission.

### 1.4 How judges score (1 to 5 for each)

| Criterion | What judges look for | Where this project addresses it |
|---|---|---|
| Impact | Size of the problem and how many people it helps | Smallholder and family farmers deciding on rotations under climate change (§3) |
| Creativity | Originality, or a meaningful improvement on existing ideas | Replays 20 years of NASA weather season by season for each rotation; plain-language insights each linked to a source (§11, §13) |
| Validity | Scientific grounding, feasibility, usability | FAO-56, USDA-NRCS, Saxton-Rawls, FAOSTAT; 78 automated tests; missing data is never shown as zero (§11, §17) |
| Relevance | Directly answers the challenge | Requirement-by-requirement mapping in §4 |
| Presentation | Quality of the demo and project page | §19 |

---

## 2. Project name and summary (ready to paste)

**Project name:** Field Shift Advisor

**High-level project summary:**

> Field Shift Advisor is a web app that helps farmers compare crop rotations for their own field using NASA Earth-observation data. A farmer searches their village or drops a pin, and can draw the exact field outline. The app downloads 20 or more years of daily NASA POWER weather for that spot: rain, temperature, humidity, wind, sunlight and root-zone soil wetness. It adds soil (ISRIC SoilGrids) and slope (Copernicus DEM) data. It then replays every past season of the farmer's current rotation and at least four alternatives. Each season is checked for heat at flowering, frost, and water shortfall, using FAO crop-water science. Each rotation gets Water, Soil, Income and Resilience scores, weighted by the farmer's own priorities. For each rotation the app explains in plain language why it was suggested, its benefits and risks, what data is missing, and what to check locally. Every statement links to its source, and missing data is never shown as zero. The app helps farmers plan for hotter, more uncertain seasons, and it supports, but does not replace, their own experience and local experts.

---

## 3. Detailed project description (ready to paste)

### What it does

1. **Find the place.** Search an address (OpenStreetMap geocoding), use the device's GPS, or click the map.
2. **Mark the field (optional, with an account).** Draw the field as a free polygon, a rectangle or a circle. The app shows its area (m², hectares, acres), its perimeter and every side's length while you draw. Saved fields are private to each user.
3. **Tell us about the farm.** Current rotation, irrigation (none, limited or reliable), water source, soil type, goals, equipment and market access.
4. **Set priorities.** Sliders for Water, Soil, Income and Resilience. Scenario sliders for rainfall (60–140%) and warming (+0 to +4 °C).
5. **Get results.**
   - The rotations ranked best to worst, each with a score range across past years (10th–90th percentile).
   - A score breakdown and a radar chart.
   - The water balance and climate charts.
   - Site conditions: soil texture, water-holding capacity, slope and elevation.
   - A "right now" status from the last 14–30 days of NASA data.
   - For each rotation, tabs for **Benefits and risks**, **Gaps and farm checks** and **Evidence**, each linked to its source.
   - For a saved field, an estimate of yearly crop sales for its actual area.

### How it works

- **NASA data in.** The backend calls the NASA POWER Daily API (community `AG`) for the 0.5° cell that contains the point. It covers 2005 to the latest available day and is cached on disk, so the full history is fetched once per cell.
- **Agro-meteorology.**
  - Daily reference evapotranspiration uses the FAO-56 Penman-Monteith method, falling back to Hargreaves when radiation data lag.
  - Monthly effective rainfall uses the USDA-SCS method.
  - Plant-available soil water comes from Saxton-Rawls (2006), using SoilGrids sand, clay and organic carbon.
- **Season replay.**
  - Every crop in every rotation is checked for every past year, using its local sowing and harvest months.
  - Crop water demand is Σ (Kc × ETo) over the FAO-56 four growth stages.
  - Heat days count only at flowering (mid-season), and frost days only during development through mid-season.
  - A season is *viable* if heat, frost and water are all acceptable.
- **Scores (0–100).**
  - **Water:** the mean seasonal deficit compared with a reference.
  - **Soil:** USDA-NRCS soil-health principles (months with living roots, plus nitrogen from legumes), erosion cover (bare months × slope × heavy-rain days), and pest-cycle break (NRCS Code 328).
  - **Resilience:** the share of past seasons that were viable.
  - **Income:** FAOSTAT national yield × producer price × the viable share. It is used only when every crop has recent official data; otherwise income is left out and the other weights are rescaled.
- **Explanations.** A rule-based module turns the numbers into short farmer-language statements, each linked to an authority (FAO, USDA, university or journal).
- **No AI at runtime.** All scoring is deterministic mathematics. The same input always gives the same output.

### Benefits

- Uses free, global NASA data, so it works anywhere in the supported crop-calendar regions without local sensors.
- Shows the trade-offs between water, soil, income and resilience, and lets farmers weight them.
- Highlights bare-soil months, heat and frost risk at the vulnerable growth stage, pest-cycle breaks and nitrogen savings (in bags of urea per hectare).
- Honest: it shows uncertainty, data gaps and checks, and hides any card that has no real data.

### What we hope to achieve

A free tool that extension workers and farmers can use to start a conversation about switching rotations, backed by NASA evidence. Next steps:
- more regions and crop calendars;
- SMAP and MODIS for any point;
- Urdu and other local languages;
- validation with local agronomists.

### Tools, languages, hardware and software

- **Languages:** Python 3.12, TypeScript, SQL (PostgreSQL / PostGIS).
- **Backend:** FastAPI, Pydantic v2, pandas, NumPy, SciPy, httpx, rasterio, pymannkendall, pytest.
- **Frontend:** React 19, Vite 8, Tailwind CSS 4, React Router 7, TanStack Query 5, Zustand, Leaflet / react-leaflet, Recharts, lucide-react.
- **Database and auth:** Supabase (PostgreSQL + PostGIS, Row-Level Security, email/password auth).
- **Data pipeline:** Google Earth Engine (`earthengine-api`), NASA `earthaccess`, xarray, h5py, netCDF4.
- **Development tools:** VS Code, Git/GitHub, Claude Code (AI coding assistant, see §16), Playwright (browser checks).
- **Hardware:** none. Software only, running in any modern browser on phone or desktop.

---

## 4. How the project meets the challenge

| Challenge requirement | How Field Shift Advisor meets it |
|---|---|
| Combine NASA Earth observations with local soil, crop and farmer data | NASA POWER (8 parameters) plus SoilGrids soil, Copernicus DEM slope, the crop catalog and the farmer's form inputs |
| Compare at least 3 rotation strategies, including the current one | 5 rotations per region (conventional, water-saving, soil-building, income); the current one is labelled "Your current" |
| Explain why each was suggested | A "Why" strip for each rotation |
| Show supporting evidence | Evidence tab grouped as Climate / Water / Soil / Land / Crops / Market / Your farm, each item with a source link |
| Benefits | Benefits list for each rotation (water saved, nitrogen added, living-root months, income) |
| Information gaps | Gaps list (missing months, soil or terrain unavailable, ETo fallback, income not compared) |
| Risks needing local review | Risks (heat, frost and water failures by crop, bare months, pest family) and Farm checks (soil test, sowing dates, water supply, agronomist) |
| Farmer priorities | Water / Soil / Income / Resilience sliders; irrigation level; farm details |
| Temperature, heat stress, frost, rainfall, extreme rain | POWER T2M_MAX / T2M_MIN / PRECTOTCORR → heat days at 30/34/38/42 °C, frost days ≤0 °C, heavy-rain days ≥25 mm, dry spells |
| Soil moisture and evaporation | POWER GWETROOT (root-zone wetness); FAO-56 ETo from RH2M, WS2M and ALLSKY_SFC_SW_DWN |
| Long-term trends | Rain and temperature trend per decade; per-year score range |
| Bare-field periods | Living-root months and bare months per rotation |
| Rotations that break pest cycles | Pest-break score by crop family (NRCS Code 328) |
| Water demand reduction | Seasonal crop water need (mm and m³/ha) compared with the current rotation |
| Nitrogen fixation, cover, deep-rooting and drought-tolerant crops | Legume nitrogen (sourced kg N/ha), cereal rye cover crop, root depth and drought tolerance in the catalog |
| Interactive map and scenario sliders | Leaflet map with satellite layer and field drawing; rainfall and warming sliders |
| Satellite versus ground measurement, uncertainty | Resolution note (about 50 km climate cell); confidence level; 10th–90th percentile range; data-quality badges |
| Supports, not replaces, local expertise | Disclaimer on every result; checks direct the farmer to a soil test and an agronomist |
| Harmonize different resolutions | Everything is reduced to a point and a calendar month: POWER cell, SoilGrids 250 m pixel, DEM 11×11 window (~330 m) |

---

## 5. System architecture

```mermaid
flowchart LR
  U[Farmer's browser<br/>React app] -->|search| GEO[Photon / Nominatim<br/>geocoding]
  U -->|sign in, save fields| SB[(Supabase<br/>Postgres + PostGIS + Auth)]
  U -->|POST /api/v1/locations/compare| API[FastAPI backend]
  API --> PH[NASA POWER Daily API<br/>2005 → today]
  API --> SG[ISRIC SoilGrids v2.0]
  API --> DEM[Copernicus DEM GLO-30<br/>AWS open data]
  API --> CAT[(Catalog JSON<br/>crops, rotations, parameters,<br/>regions, FAOSTAT market)]
  PH --> AG[Agromet: FAO-56 ETo,<br/>USDA-SCS rain, Saxton-Rawls]
  SG --> AG
  AG --> ENG[Rotation engine<br/>season replay + scores]
  DEM --> ENG
  CAT --> ENG
  ENG --> EXP[Explain: insights,<br/>evidence, gaps, checks]
  EXP --> API
  subgraph Offline pipeline (pilot field F01)
    EE[Google Earth Engine] --> SMAP[SMAP L4 SPL4SMGP v008]
    EE --> MODIS[MODIS MOD13Q1 v061]
    PW[NASA POWER] --> INT[integrate_nasa_data.py]
    SMAP --> INT
    MODIS --> INT
  end
```

| Module | Role | Folder |
|---|---|---|
| M1: data pipeline | NASA extraction, integration and validation for the pilot field | `pipeline/`, `data/raw/`, `data/processed/` |
| M2: backend | API, live data, agromet, rotation engine, explanations | `backend/` |
| M3: data catalog | Crops, rotations, regions, parameters, market data | `data/*.json`, `backend/scripts/build_market_data.py` |
| M4: frontend | React web app, accounts, field drawing | `frontend/` |
| Database | Supabase schema and security policies | `supabase/migrations/` |

**Request flow for one analysis**

1. The browser sends `{lat, lon, irrigation, current_rotation_id, priorities, scenario}`.
2. The backend finds the crop region (`regions.json`, approximate rectangles). Points outside every region get HTTP 422; they are never assigned to the nearest region.
3. It loads the POWER history for the 0.5° cell (cache, or a live call), and SoilGrids and DEM values for the point (each cached for 30 days).
4. It builds a temporary field profile: monthly rain, temperature, heat and frost days, ETo, and climatology.
5. The engine scores every rotation in the region; the explain module adds the text.
6. The response includes the ranked rotations, data quality, sources used, warnings and the "right now" status.

---

## 6. Technology stack

### 6.1 Backend (`backend/requirements.txt`)

| Package | Version (installed) | Used for |
|---|---|---|
| FastAPI | 0.163.0 | REST API, OpenAPI docs at `/docs` |
| Uvicorn | ≥0.29 | ASGI server |
| Pydantic | 2.14.3 | Request and response validation (`app/models/schemas.py`) |
| httpx | ≥0.27 | Calls to NASA POWER, SoilGrids and Nominatim |
| pandas | 3.1.1 | Daily-to-monthly aggregation |
| NumPy / SciPy | ≥1.26 / ≥1.12 | Numerical work, percentiles, slope plane fit |
| rasterio | 1.5.2 | Reading Copernicus DEM Cloud-Optimized GeoTIFFs |
| pymannkendall | ≥1.4.3 | Trend tests |
| python-dotenv | ≥1.0.1 | `.env` settings |
| pytest | ≥8.0 | 78 automated tests |

Runtime: Python 3.12.3.

### 6.2 Data pipeline (`pipeline/requirements.txt`)

`earthengine-api` (SMAP and MODIS through Google Earth Engine), `earthaccess` (NASA Earthdata), `h5py`, `xarray`, `netCDF4`, `requests`, `tqdm`, `pandas`, `numpy`, `pyarrow`, `pymannkendall`.

### 6.3 Frontend (`frontend/package.json`)

| Package | Version | Used for |
|---|---|---|
| React / React DOM | ^19.3 | UI |
| TypeScript | ~7.0 | Type safety |
| Vite | ^8.3 | Dev server and build |
| Tailwind CSS (+ @tailwindcss/vite) | ^4.3 | Styling |
| React Router | ^7.18 | Pages |
| TanStack Query | ^5.107 | Server data and caching |
| Zustand | ^5.1 | App and auth state |
| Leaflet / react-leaflet | ^1.9 / ^5.0 | Maps, field drawing |
| Recharts | ^3.10 | Charts |
| @supabase/supabase-js | ^2.119 | Accounts and saved fields |
| lucide-react | ^1.73 | Icons |
| oxlint | ^1.90 | Linting |

Runtime used in development: Node.js 24.

---

## 7. NASA data used (datasets, parameters, attributes)

### 7.1 NASA POWER (core, live, used for every analysis)

- **Provider:** NASA Langley Research Center, Prediction Of Worldwide Energy Resources (POWER) project.
- **API:** POWER Daily Point API, `GET https://power.larc.nasa.gov/api/temporal/daily/point`
- **Request parameters:**
  - `parameters` = the list below
  - `community=AG` (agroclimatology units)
  - `latitude`, `longitude` = centre of the 0.5° cell
  - `start=20050101`, `end` = today minus 5 days (POWER publishing lag)
  - `format=JSON`
- **Authentication:** none (free and open).
- **Underlying sources:** meteorology from NASA GMAO MERRA-2 reanalysis; solar radiation from NASA CERES (SYN1deg / FLASHFlux).
- **Code:** `backend/app/services/power_history.py`, `power_live.py`, `m1_profile.py`, `agromet.py`.

| POWER parameter | Meaning | Unit (AG community) | How we use it |
|---|---|---|---|
| `PRECTOTCORR` | Precipitation, bias-corrected (MERRA-2) | mm/day | Monthly rain; effective rain (USDA-SCS); heavy-rain days ≥25 mm (erosion); longest dry spell; 14-day "now" rain; rain trend; rainfall scenario multiplier |
| `T2M` | Mean air temperature at 2 m | °C | Monthly mean temperature; warming scenario effect on ETo; temperature trend |
| `T2M_MAX` | Daily maximum temperature at 2 m | °C | Heat days ≥30/34/38/42 °C (heat at flowering); ETo; current heat status |
| `T2M_MIN` | Daily minimum temperature at 2 m | °C | Frost days ≤0 °C (frost risk); ETo |
| `RH2M` | Relative humidity at 2 m | % | Actual vapour pressure for FAO-56 Penman-Monteith ETo |
| `WS2M` | Wind speed at 2 m | m/s | Penman-Monteith ETo |
| `ALLSKY_SFC_SW_DWN` | All-sky surface shortwave downward irradiance | MJ/m²/day | Net radiation for Penman-Monteith ETo |
| `GWETROOT` | Root-zone soil wetness (MERRA-2), 0 = dry, 1 = saturated | 0–1 | Average root-zone wetness (Evidence and "right now" checks) |
| Elevation (response header) | POWER cell mean elevation | m | Atmospheric pressure for ETo when the DEM is missing |

**Derived attributes** (`m1_profile.profile_from_daily`):
- Monthly values: rain (mm), mean, max and min temperature, heat days at each threshold, frost days, ETo (mm). A month is reported only if at least 80% of its days exist.
- Annual climatology (complete years only, at least 360 days): mean annual rain, heavy-rain days, longest dry spell, mean ETo, mean GWETROOT, and trends per decade.
- "Right now": the last 14 and 30 days of rain, maximum temperature and root-zone wetness.

**Caching:**
- One file per 0.5° cell in `data/cache/power/`.
- The historical part is never fetched again.
- After 24 h, only the last 30 days are refreshed.
- If NASA is unreachable, stale cached data is used and flagged.
- One lock per cell prevents duplicate requests.

### 7.2 NASA SMAP L4 (pilot field, offline pipeline)

| Item | Value |
|---|---|
| Product | SMAP L4 Global 3-hourly 9 km Surface and Root-Zone Soil Moisture, **SPL4SMGP version 8** |
| Access | Google Earth Engine collection `NASA/SMAP/SPL4SMGP/008` (`pipeline/extract_smap.py`) |
| Bands (attributes) | `sm_surface` (0–5 cm, m³/m³), `sm_rootzone` (0–100 cm, m³/m³) |
| Processing | Daily mean of the eight 3-hourly images (`n_images` column); point 33.7908 N, 72.6625 E |
| Period | 2015-03-31 to 2026-11-10 |
| Used for | Pilot field F01 profile: monthly root-zone soil moisture and the "now" root-zone dryness check (dry below 0.15 m³/m³) |

### 7.3 NASA / USGS MODIS Terra MOD13Q1 (pilot field, offline pipeline)

| Item | Value |
|---|---|
| Product | MODIS/Terra Vegetation Indices 16-Day L3 Global 250 m, **MOD13Q1 v061** |
| Access | Google Earth Engine (`pipeline/validate_modis.py`; file `data/raw/F01/F01_MODIS_NDVI_EVI.csv`) |
| Attributes | `NDVI`, `EVI` (scaled to −1…1), `SummaryQA` (only 0 = good and 1 = marginal are kept), composite date |
| Used for | Pilot profile: bare-soil days (NDVI < 0.2), vegetation status "now" (low below 0.25) |

The pilot integrated file `data/processed/F01/F01_nasa_integrated_daily.csv` has these columns: `date, PRECTOTCORR, T2M, T2M_MAX, T2M_MIN, RH2M, ALLSKY_SFC_SW_DWN, sm_surface, sm_rootzone, n_images, NDVI, EVI, SummaryQA, MODIS_composite_date`.

> **Honest scope.** The live analysis for any point uses NASA POWER only. SMAP and MODIS for arbitrary points would need Earth Engine credentials on the server, which we did not deploy. The backend code supports SMAP and MODIS when a processed profile exists (pilot field F01).

### 7.4 NASA datasets reviewed but not used

The challenge suggests GPM IMERG, ECOSTRESS, Landsat, GRACE/GRACE-FO, SRTM and GEDI. They are listed in `data/nasa_metadata.json` as future or context sources. Copernicus DEM was used instead of SRTM because it has public cloud-optimized tiles and needs no login.

---

## 8. Space Agency Partner data and other data

| Source | Organisation | What we use (attributes) | How |
|---|---|---|---|
| **Copernicus DEM GLO-30** | **ESA** / European Union Copernicus programme (ESA is a 2026 Space Apps Space Agency Partner) | `elevation_m`; `slope_deg` from a least-squares plane over 11×11 pixels (~330 m) | Public Cloud-Optimized GeoTIFFs on AWS: `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_<N/S><lat>_00_<E/W><lon>_00_DEM/...tif`. No credentials. Read with rasterio. Slope feeds the erosion score. |
| **ISRIC SoilGrids v2.0** | ISRIC World Soil Information (non-NASA) | `clay` (%), `sand` (%), `soc` organic carbon (g/kg), `phh2o` pH. Depth-weighted mean of the 0–5, 5–15 and 15–30 cm layers | `GET https://rest.isric.org/soilgrids/v2.0/properties/query`. If the point is masked (city or water), the nearest valid pixel within 300 m is used and the offset is reported. Feeds texture class, Saxton-Rawls water holding, and pH checks. |
| **FAOSTAT** | Food and Agriculture Organization of the UN | QCL *Yield* (kg/ha) and PP *Producer Price* (USD/tonne), national, for Pakistan and the USA | Bulk downloads (`Production_Crops_Livestock_E_*`, `Prices_E_*`) processed by `backend/scripts/build_market_data.py` into `data/market_faostat.json`. Mean of the latest 3 years (2022–2024); values older than 5 years are rejected. |
| Crop parameters | FAO-56 (Allen et al. 1998), FAO EcoCrop, FAO GAEZ v4 | Kc (initial, mid, end), growth-stage fractions, heat thresholds, water need, root depth | `data/crops.json` |
| Legume nitrogen | Pakistan Journal of Botany; IAEA INIS; Zagazig J. Agric. Res.; Iowa State University | Net N left for the next crop: chickpea 35, mungbean 24, berseem 50, soybean 0 kg N/ha (with ranges) | `data/crops.json` (`n_fix_*` fields, with source URLs) |
| Crop calendars | Pakistan and US Midwest sowing and harvest months | Sow and harvest month for each region | `data/crops.json` (`calendars`) |
| OpenStreetMap | OSM contributors via Nominatim and Photon | Address → latitude/longitude | §9 |
| Esri ArcGIS basemaps | Esri | World Imagery (satellite), World Street Map, Dark Gray Canvas tiles | Map backgrounds |

**FAOSTAT values in the app** (`data/market_faostat.json`, retrieved 15 Nov 2026):

| Crop | Pakistan yield kg/ha | Pakistan price USD/t | USA yield kg/ha | USA price USD/t |
|---|---|---|---|---|
| Wheat | 3,101.8 | 359.8 | 3,280.7 | 263.4 |
| Maize | 6,151.8 | 302.9 | 11,091.2 | 204.7 |
| Rice | 3,832.4 | 810.2 | 8,511.6 | 382.9 |
| Soybean | 626.4 | — (stale, 2010) | 3,382.4 | 450.7 |
| Chickpea | 306.1 | — (no series) | 1,318.3 | 751.8 |
| Sorghum | 824.7 | — (stale, 2010) | 3,230.4 | 211.0 |
| Cotton | 1,638.5 | — (stale, 2016) | 2,831.2 | — (no price) |
| Mungbean, Berseem | no FAOSTAT series | — | no series | — |

Because some Punjab rotations contain crops without a current price, income is **not compared** for Punjab, and the app says why. In the US Midwest, income is scored.

---

## 9. External APIs and services

| Name | URL | Auth | Called from | Purpose | Limits and handling |
|---|---|---|---|---|---|
| NASA POWER Daily Point API | `https://power.larc.nasa.gov/api/temporal/daily/point` | None | Backend `power_history.py` | 20+ years of daily weather | 60 s timeout; cell cache; stale fallback; HTTP 503 if no cache |
| ISRIC SoilGrids REST v2.0 | `https://rest.isric.org/soilgrids/v2.0/properties/query` | None | Backend `location_data.py` | Soil texture, carbon, pH | 12 s timeout; cached 30 days; "no soil" answers cached 6 h; timeouts retried after 10 min |
| Copernicus DEM GLO-30 (AWS Open Data) | `https://copernicus-dem-30m.s3.amazonaws.com/` | None | Backend `location_data.py` | Elevation and slope | Cached 30 days |
| Nominatim (OpenStreetMap) | `https://nominatim.openstreetmap.org/search` | None | Backend `/api/v1/geocode` | Address → coordinates when adding a field | 1 request per second (usage policy); in-memory cache; generic User-Agent |
| Photon (Komoot) | `https://photon.komoot.io` | None | Frontend `lib/geo/geocode.ts` | Map search box with suggestions | Keyless, CORS-enabled |
| Esri ArcGIS tile services | `https://server.arcgisonline.com/ArcGIS/rest/services/...` | None | Frontend maps | Satellite and street tiles | Attribution shown on the map |
| Supabase | Project URL plus publishable (anon) key | Email/password (Supabase Auth) | Frontend `lib/supabase.ts`, `api/account.ts` | Accounts and saved fields | Row-Level Security; only the public key is in the browser |
| FAOSTAT bulk download | `https://bulks-faostat.fao.org/production/` | None | Offline script `build_market_data.py` | Yield and price | Run manually; the app reads the JSON |
| Google Earth Engine | `earthengine-api` | Google account / project | Offline `pipeline/` | SMAP and MODIS extraction for the pilot field | Not used by the live app |

---

## 10. Backend REST API reference

Base URL: `http://localhost:8000/api/v1`. Interactive OpenAPI docs: `http://localhost:8000/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service status and data mode |
| GET | `/regions` | Supported crop-calendar regions (Punjab, Pakistan; US Midwest) |
| GET | `/locations/region?lat&lon` | Region for a point and its rotations (422 if unsupported) |
| GET | `/locations/data?lat&lon` | SoilGrids and DEM values for any point on Earth (rate-limited) |
| POST | `/locations/compare` | **Main analysis:** rank rotations for a point |
| GET | `/rotations?region_id=` | Rotation catalog |
| GET | `/crops` | Crop catalog |
| GET | `/meta/sources` | Data-source metadata |
| GET | `/geocode?q=` | Address search (Nominatim proxy, at most 5 results) |

**`POST /locations/compare` request:**

```json
{
  "location": {"lat": 31.42, "lon": 73.08},
  "irrigation": "limited",
  "current_rotation_id": "rot_pk_rice_wheat",
  "priorities": {"w_water": 0.25, "w_soil": 0.25, "w_income": 0.25, "w_resilience": 0.25},
  "scenario": {"rain_multiplier": 1.0, "temp_delta_c": 0.0},
  "rotation_ids": null
}
```

- `irrigation` is one of `none`, `limited` or `reliable`, which adds 0, 200 or 800 mm per season.
- `rain_multiplier` is 0.6–1.4 and `temp_delta_c` is 0–4. `current_crop` can replace `current_rotation_id` if that crop appears in exactly one rotation.

**Response (main fields):**
- `rotations[]` with `rank`, `is_existing`, `overall`, `overall_low`, `overall_high`, `scores` (water, soil, resilience, and income when scored), `components`, `why`, `insights[]`, `evidence[]`, `confidence` and `annual_value_usd_ha`
- `income_status`
- `data_quality`
- `sources`
- `location` (region, NASA cell, resolution note)
- `analysis_type` = `historical_rotation_suitability`
- `warnings[]`
- `data_retrieval` (`live`, `cache`, `refreshed` or `stale_cache`)
- `now` (FAVORABLE, WATCH or STRESSED, with reasons)
- `disclaimer`

**Errors** (always `{"detail": "..."}`):

| Status | Meaning |
|---|---|
| 422 | Invalid input, or a point outside the supported regions |
| 429 | Rate limit (10 uncached analyses per minute per client by default) |
| 503 | NASA unreachable and nothing in the cache, or address search down |
| 500 | Unexpected error; details are logged, not returned |

---

## 11. Science and scoring method

All tunable numbers are in `data/parameters.json`. They are marked `"validated": false` because they have not been field-validated, so confidence never reaches HIGH until they are.

### 11.1 Season check (each crop, each past year)

| Step | Formula and rule | Source |
|---|---|---|
| Season window | The crop's sow and harvest months for the region; winter crops cross the year boundary | Regional crop calendars |
| Growth stages | FAO-56 four stages (initial, development, mid, late) using `stage_fractions` and Kc | FAO-56 Tables 11–12 |
| Reference ET (ETo) | Penman-Monteith, FAO-56 eq. 6, daily from POWER; Hargreaves (eq. 52) on days without radiation, humidity or wind | Allen et al. 1998 |
| Warming scenario | ETo is scaled by a temperature factor for +ΔT; heat thresholds shift by ΔT | Parameter |
| Crop water demand | Σ over months (Kc_stage × ETo), or the catalog `water_need_mm` if ETo is missing | FAO-56 |
| Effective rain | USDA-SCS monthly method (as in FAO CROPWAT), × rainfall scenario | USDA-SCS / FAO |
| Soil water | Saxton-Rawls (2006): field capacity (−33 kPa) minus wilting point (−1500 kPa), times rooting depth (max 150 cm), times a start fraction of 0.5 | Saxton & Rawls 2006 |
| Supply | effective rain + soil water + irrigation (0 / 200 / 800 mm) | — |
| Water OK | supply ≥ f × demand, where f depends on drought tolerance (1→0.75 … 5→0.45) | Parameter |
| Heat OK | heat days at the crop's threshold, counted **only in mid-season**, ≤ the crop's tolerated days | FAO EcoCrop |
| Frost OK | frost-sensitive crop with ≥1 weighted frost day (development to mid-season) fails | Parameter |
| Viable | heat OK **and** frost OK **and** water OK | — |
| Missing data | a season with any missing month is "incomplete" and is excluded, never counted as zero | Honesty rule |

### 11.2 Scores (0–100)

| Score | Formula |
|---|---|
| **Resilience** | 100 × (viable seasons ÷ complete seasons) |
| **Water** | 100 × (1 − min(mean seasonal deficit ÷ 500 mm, 1)) |
| **Soil health** | 100 × (0.5 × living-root share + 0.5 × min(legume net N ÷ 100 kg/ha, 1)), following USDA-NRCS soil-health principles (keep living roots; reduce bare soil) |
| **Erosion** | 100 × (1 − bare fraction × (1 + slope°/10) × clip(heavy-rain days ÷ 3, 0.2, 1)) |
| **Pest break** | Average over consecutive crop pairs: 100 if a different plant family, 20 if the same (NRCS Practice Standard 328) |
| **Soil** | 0.5 × soil health + 0.3 × erosion + 0.2 × pest break |
| **Crop value (USD/ha/yr)** | Σ over crops (FAOSTAT yield t/ha × price USD/t × viable share) ÷ cycle years. If any crop lacks current data, the value is null. |
| **Income** | 100 × crop value ÷ best rotation's crop value. Scored only if every rotation has a value; otherwise income is removed and the other weights are renormalised. |
| **Overall** | w_water × Water + w_soil × Soil + w_resilience × Resilience + w_income × Income (user weights, normalised) |
| **Range** | The overall score is recomputed for each past year; `overall_low` / `overall_high` are its 10th and 90th percentiles |
| **Ranking** | Highest overall first; on a tie, the current rotation, then higher resilience, then rotation ID |

### 11.3 Confidence

- **Coverage** = share of the five evidence pillars (power, smap, modis, soil, terrain) that have real observations.
- **HIGH:** coverage ≥ 0.8, at least 10 years, and validated parameters.
- **MEDIUM:** coverage ≥ 0.5.
- **LOW:** anything else.

Demo data never counts.

### 11.4 "Right now" status

The latest POWER days are classified as **FAVORABLE**, **WATCH** or **STRESSED**:
- dry if less than 5 mm of rain in 14 days;
- heat watch at 35 °C and heat stress at 40 °C;
- root-zone dry below 0.15 m³/m³ (wetness 0.3), and low NDVI below 0.25 where available.

---

## 12. Crop and rotation catalog

### 12.1 Crops (`data/crops.json`)

| Crop | Family | Heat threshold °C | Heat days tolerated | Frost-sensitive | Water need mm | Kc (ini, mid, end) | Drought tolerance (1–5) | Net N kg/ha | Regions |
|---|---|---|---|---|---|---|---|---|---|
| Wheat | Poaceae | 34 | 8 | No | 450 | 0.40, 1.15, 0.30 | 3 | 0 | PK, US |
| Maize | Poaceae | 38 | 15 | Yes | 550 | 0.30, 1.20, 0.35 | 2 | 0 | PK, US |
| Rice | Poaceae | 38 | 30 | Yes | 1200 | 1.05, 1.20, 0.75 | 1 | 0 | PK |
| Cotton | Malvaceae | 38 | 45 | Yes | 800 | 0.35, 1.18, 0.60 | 3 | 0 | PK |
| Soybean | Fabaceae | 34 | 20 | Yes | 500 | 0.40, 1.15, 0.50 | 2 | 0 (net) | US |
| Mungbean | Fabaceae | 38 | 25 | Yes | 300 | 0.40, 1.05, 0.35 | 3 | 24 (6–83) | PK |
| Chickpea | Fabaceae | 34 | 6 | No | 300 | 0.40, 1.00, 0.35 | 4 | 35 (24–138) | PK |
| Sorghum | Poaceae | 42 | 20 | Yes | 450 | 0.30, 1.05, 0.55 | 5 | 0 | PK, US |
| Berseem clover | Fabaceae | 34 | 8 | No | 600 | 0.40, 0.90, 0.85 | 2 | 50 (33–66) | PK |
| Cereal rye (cover) | Poaceae | 34 | 10 | No | 250 | 0.30, 1.15, 0.25 | 4 | 0 | US |

### 12.2 Rotations (`data/rotations.json`): 5 per region

| Region | Rotation | Strategy |
|---|---|---|
| Punjab, Pakistan | Cotton – Wheat | Conventional |
| | Rice – Wheat | Conventional |
| | Sorghum – Chickpea | Water-saving |
| | Sorghum – Berseem Clover | Soil-building |
| | Spring Maize – Wheat | Income |
| US Midwest | Corn – Soybean | Conventional |
| | Wheat – Sorghum | Conventional |
| | Sorghum – Soybean | Water-saving |
| | Corn – Soybean + Rye cover | Soil-building |
| | Corn – Soybean – Wheat | Income |

**Regions** (`data/regions.json`) are approximate rectangles, not official borders:
- Punjab: 28–34 °N, 69.5–75.5 °E (ISO PAK)
- US Midwest: 36.5–49.5 °N, 104–80.5 °W (ISO USA)

---

## 13. Explanations: benefits, risks, gaps, checks, evidence

`backend/app/services/explain.py` is rule-based; it does **not** use AI. Every statement is computed from this location's numbers and carries a `source_url`.

| Kind | Examples of generated text | Typical source |
|---|---|---|
| **Why** | "Uses about 30% less water than your current rotation; 18 of 20 past seasons worked." | Engine results |
| **Benefit** | "Chickpea leaves about 35 kg N/ha, about 0.8 bags of urea per hectare." "Living roots 9 of 12 months." | Pakistan J. Bot.; USDA-NRCS |
| **Risk** | "Too hot at flowering: Soybean failed 1 of 22 seasons." "Bare soil 5 months with 4 heavy-rain days a year on a 3° slope." | FAO-56, NASA POWER |
| **Gap** | "Soil data unavailable here." "Income not compared: no recent FAOSTAT price for chickpea." "3 months of climate data missing." | Data status |
| **Check** | "Confirm sowing dates with your local calendar." "Get a soil test (pH 8.4 flagged)." "The climate cell is about 50 km wide; your field may differ." "Ask an agronomist before switching." | Extension guidance |
| **Evidence** | Grouped values (Climate, Water, Soil, Land, Crops, Market, Your farm), each with a label, value, unit, source and a plain interpretation | All of the above |

---

## 14. User accounts and saved fields (Supabase)

- **Auth:** Supabase email and password. The browser holds only the project URL and the publishable (anon) key. The service-role key and JWT secret are never used in the app.
- **Table** `public.fields` (`supabase/migrations/0001_user_fields.sql`):
  - Identity: `id`, `user_id` (default `auth.uid()`), `name`, `address`
  - Shape: `shape_type` (polygon / rectangle / circle), `geojson`, `radius_m`, `geom` (PostGIS geography)
  - Measurements: `center_lat`, `center_lon`, `area_m2`, `perimeter_m`
  - Farm info: `irrigation`, `current_rotation_id`, `details` (jsonb: water source, soil type, goal, equipment, market, notes)
  - Timestamps
- **Trigger** `fields_measure`:
  - checks that the geometry is valid;
  - computes `area_m2` and `perimeter_m` on the server with PostGIS geography (circles use exactly π r²);
  - allows 10 m² to 5,000 ha per field and at most 200 fields per user;
  - blocks changing a field's owner.
- **Security:** Row-Level Security with policies for select, insert, update and delete, each `user_id = auth.uid()`. Anonymous access is revoked, so one user cannot see another's fields.
- **In-browser measuring** (`frontend/src/lib/geo/measure.ts`):
  - spherical polygon area (Chamberlain–Duquette) with Earth radius 6,371,008.8 m;
  - haversine side lengths;
  - a self-intersection check;
  - circles approximated by 64 points.

---

## 15. Frontend (web app)

| Page | Route | What it shows |
|---|---|---|
| Overview | `/` | Guests: map search and a "Create account" call to action, with no field cards. Signed-in users: their saved fields on the map, with total area |
| Location analysis | `/location?lat&lon[&field&area_ha&irrigation&rotation]` | The full analysis (see §3) |
| Account | `/account` | Sign up, sign in, sign out |
| My fields | `/my-fields` | Field cards with shape preview, area (ha, acres, m²), perimeter, and Analyze / Edit buttons |
| Field editor | `/my-fields/new`, `/my-fields/:id` | 3 steps: find the area (search or GPS), mark the field (polygon, rectangle or circle with draggable points and live measurements), farm details |
| Methodology | `/methodology` | Every formula and source, in plain language |
| Pilot field | `/fields/:id` | Demo pilot fields (mock data only) |

**Results components:**
- **RecommendationHero:** the top rotation, with its score range.
- **RotationLeaderboard:** all rotations ranked.
- **ScoreRadar:** score breakdown.
- **WaterBalanceChart** and **ClimatePanel:** water balance and climate history.
- **SiteConditions:** soil, slope and elevation.
- **NowPanel:** "right now" status.
- **PriorityPanel:** priority and scenario sliders.
- **RotationDetail:** for each rotation, an **InsightAccordion** (expandable rows with source chips) and an **EvidenceExplorer** (side tabs by group).
- **DataSourcesPanel:** lists only the sources actually used.
- **Disclaimer.**

**Design rules:**
- Hide any card with no data; never show "0" for missing data.
- Plain farmer language.
- Mobile-friendly: 16 px side gutter, no horizontal scroll.
- Respects reduced-motion settings.

---

## 16. Use of Super Intelligence (AI) disclosure

### 16.1 AI inside the product

**None.** Field Shift Advisor uses no machine-learning model, chatbot or large language model at runtime:
- the rotation engine is deterministic mathematics (`rotation_engine.py`, line 4: "zero LLM/AI calls");
- the explanations are rule-based templates filled with computed numbers (`explain.py`);
- the same input always gives the same result.

### 16.2 AI used during development

| Item | Detail |
|---|---|
| Tool | **Claude Code**, Anthropic's AI coding assistant, used in VS Code |
| Model | **Claude** by Anthropic (Claude Opus family, e.g. Claude Opus 5.5) |
| Used for | Writing and refactoring code (backend services, scoring engine, explanation module, React components, Supabase SQL), writing tests, debugging, checking scientific sources and URLs, and drafting documentation (including this file) |
| Not used for | Coming up with the project idea or the solution approach (they came from the team and the challenge brief), the NASA data itself, or any runtime decision in the app |
| Human role | The team chose the idea, the data sources, the science and the design, and reviewed, ran and tested all AI-assisted code (78 automated tests, browser checks) |
| Images, video, audio | No AI-generated images, video or audio in the app. *(If any are used in the demo, they must carry a visible "AI-generated" watermark.)* |
| Amount | **Team to fill in:** an honest estimate, for example "about X% of the code was drafted with Claude Code and reviewed by the team." |

**Suggested text for the SI form field:**

> Yes. We used Claude Code (Anthropic's Claude AI coding assistant) during development to help write and refactor code, write tests, debug, check scientific references and draft documentation. The project idea, the choice of NASA data, the scientific method and the design are the team's own. All AI-assisted code was reviewed and tested by the team (78 automated backend tests). The app itself uses no AI at runtime: scoring is deterministic and explanations are rule-based. No AI-generated images, audio or NASA branding are used.

The 2026 rules ask that AI-generated code be acknowledged in descriptive text **and metadata**. This section is the descriptive text. For metadata, a note in the README and `Co-Authored-By: Claude` lines in the git commits serve that purpose.

---

## 17. Data quality, honesty rules and limitations

### Rules built into the code

- **Null means "no observation".** Missing values are never turned into 0.
- Cards, tiles and evidence rows with no data are hidden.
- Only sources actually used are listed.
- Income is scored only from current official FAOSTAT data; otherwise it is "not compared", with the reason.
- Points outside the supported regions are refused, never mapped to the nearest region.
- Every result is labelled as historical suitability, not a forecast.

### Known limitations

1. **Climate resolution.** POWER is a roughly 0.5° (about 50 km) grid, not a field sensor.
2. **SMAP and MODIS.** These are used only for the pilot field. Live analysis at other points uses POWER's MERRA-2 root-zone wetness instead.
3. **Two regions only** (Punjab, Pakistan and US Midwest), and they are approximate rectangles.
4. **Unvalidated parameters.** Weights and thresholds are literature-based but not field-validated, so confidence is capped at MEDIUM.
5. **National prices.** FAOSTAT yields and prices are national averages. Local markets differ, and some Pakistani crops have no recent price.
6. **Modelled soil.** SoilGrids is a 250 m model, not a lab test. The DEM is a surface model that includes buildings and trees.
7. **Pest break** uses plant family only, not specific pests or diseases.
8. **Untested sign-up.** Account sign-up and field saving depend on the Supabase project having the Email provider enabled.
9. **Frontend tests.** The frontend has no automated unit tests; it was checked by build, type-checking and browser runs.

---

## 18. Installation, running and testing

**Requirements:** Python 3.12+, Node.js 20+.

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
cp ../.env.example ../.env        # optional settings
python -m uvicorn app.main:app --port 8000
# API docs: http://localhost:8000/docs
```

Optional environment variables:

| Variable | Default |
|---|---|
| `POWER_HISTORY_START_YEAR` | 2005 |
| `POWER_HISTORY_TTL_HOURS` | 24 |
| `LOCATION_RATE_LIMIT_PER_MINUTE` | 10 |
| `CORS_ORIGINS` | — |
| `DATA_MODE` | `demo` (set `processed` for pilot data) |

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# set VITE_USE_MOCK=false, VITE_API_URL=http://localhost:8000
# set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable key only)
npm run dev                       # http://localhost:5173
```

### Database

Run `supabase/migrations/0001_user_fields.sql` in the Supabase SQL editor, enable the Email provider, and turn off "Confirm email" if you want instant sign-in (see `supabase/README.md`).

### Market data refresh (optional)

```bash
python backend/scripts/build_market_data.py   # downloads FAOSTAT bulk files, writes data/market_faostat.json
```

### Tests and checks

```bash
cd backend && python -m pytest -q     # 78 passed (NASA calls are mocked)
python data/validate_data.py          # 8 fields, 10 crops, 10 rotations, 15 sources: ALL CHECKS PASSED
cd frontend && npm run build          # type-check and production build
```

---

## 19. Project demo guide (30-second video or 7 slides)

Strict limits: video of 30 seconds or less, or 7 slides or fewer, in English. A video in another language needs English subtitles. Host it publicly with no login, and show no one under 18.

### Option A: 30-second video script

| Time | Show | Say |
|---|---|---|
| 0:00–0:02 | Team name card | "We are team ___." |
| 0:02–0:05 | A farm field | "Our challenge: help farmers choose crop rotations as the climate changes." |
| 0:05–0:10 | App logo and title | "Field Shift Advisor: 20 years of NASA data for your field." |
| 0:10–0:20 | Screen recording: search a village, draw the field, press Analyze, show the ranked rotations and a benefit with its source | "Draw your field. We replay every past season with NASA POWER weather, soil and slope, and compare your rotation with four others on water, soil, income and resilience, in plain words." |
| 0:20–0:30 | Map zooming out across regions | "Free and open for any farmer: fewer failed seasons, healthier soil, less water." |

### Option B: 7 slides

1. **Title:** Field Shift Advisor, the team name, team member names, and the challenge name.
2. **Problem:** farmers face heat, erratic rain and soil loss; a rotation choice lasts years.
3. **Solution:** screenshot of the map and field drawing; the user journey in three steps.
4. **NASA data:** POWER parameters (rain, temperature, humidity, wind, sunlight, root-zone wetness), SMAP and MODIS in the pilot, plus Copernicus DEM (ESA) and SoilGrids.
5. **How it works:** season replay → four scores → plain-language insights with sources.
6. **Results:** screenshot of the leaderboard, benefits and risks, and the evidence tab; an example from Punjab or Iowa.
7. **Impact and next steps:** more regions, SMAP and MODIS for any point, local languages, agronomist validation.

---

## 20. References

**NASA data and tools**
- NASA POWER project and Daily API: <https://power.larc.nasa.gov/> · <https://power.larc.nasa.gov/docs/services/api/temporal/daily/>
- MERRA-2 reanalysis (NASA GMAO): <https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/>
- CERES (NASA LaRC): <https://ceres.larc.nasa.gov/>
- SMAP L4 SPL4SMGP v008 (NSIDC DAAC): <https://nsidc.org/data/spl4smgp/versions/8>
- Earth Engine catalog, SMAP L4: <https://developers.google.com/earth-engine/datasets/catalog/NASA_SMAP_SPL4SMGP_008>
- MODIS MOD13Q1 v061 (LP DAAC): <https://lpdaac.usgs.gov/products/mod13q1v061/>

**Space Agency Partner and other data**
- Copernicus DEM GLO-30 (ESA / Copernicus): <https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model> · AWS Open Data: <https://registry.opendata.aws/copernicus-dem/>
- ISRIC SoilGrids v2.0: <https://www.isric.org/explore/soilgrids> · API: <https://rest.isric.org/soilgrids/v2.0/docs>
- FAOSTAT: <https://www.fao.org/faostat/en/#data>
- OpenStreetMap / Nominatim: <https://nominatim.org/> (usage policy: <https://operations.osmfoundation.org/policies/nominatim/>) · Photon: <https://photon.komoot.io/>
- Esri ArcGIS basemaps: <https://www.arcgis.com/>

**Science**
- Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). *Crop evapotranspiration*, FAO Irrigation and Drainage Paper 56: <https://www.fao.org/4/x0490e/x0490e00.htm>
- Saxton, K.E., Rawls, W.J. (2006). Soil water characteristic estimates by texture and organic matter. *Soil Sci. Soc. Am. J.* 70: 1569–1578: <https://doi.org/10.2136/sssaj2005.0117>
- USDA-SCS effective rainfall method (as implemented in FAO CROPWAT): <https://www.fao.org/land-water/databases-and-software/cropwat/en/>
- USDA-NRCS Soil Health principles: <https://www.nrcs.usda.gov/conservation-basics/natural-resource-concerns/soil/soil-health>
- USDA-NRCS Conservation Practice Standard 328, Conservation Crop Rotation: <https://www.nrcs.usda.gov/sites/default/files/2022-09/Conservation_Crop_Rotation_328_CPS.pdf>
- FAO EcoCrop: <https://gaez.fao.org/pages/ecocrop> · FAO GAEZ v4: <https://gaez.fao.org/>
- Chickpea nitrogen, Pakistan Journal of Botany: <https://www.pakbs.org/pjbot/paper_details.php?id=321> · <https://pakbs.org/pjbot/paper_details.php?id=1525>
- Mungbean nitrogen: IAEA INIS <https://inis.iaea.org/records/av3bf-rn338> · Pakistan J. Bot. 48(1) <https://mail.pakbs.org/pjbot/PDFs/48(1)/43.pdf>
- Berseem nitrogen, Zagazig J. Agric. Res.: <https://zjar.journals.ekb.eg/article_297652_75ab256d516da61ad01cec7147f73c95.pdf>
- Soybean nitrogen balance, Iowa State University: <https://www.agronext.iastate.edu/soilfertility/info/Castellano%20ICM%20Formatted.pdf>
- Chamberlain, R.G., Duquette, W.H. (2007). Some algorithms for polygons on a sphere. JPL Publication 07-03: <https://trs.jpl.nasa.gov/handle/2014/41271>

**Software (open source)**
- FastAPI, Pydantic, Uvicorn, httpx, pandas, NumPy, SciPy, rasterio, pymannkendall, pytest
- React, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, Zustand, Leaflet, react-leaflet, Recharts, lucide-react, oxlint
- Supabase, PostgreSQL, PostGIS
- Google Earth Engine API, NASA earthaccess, xarray, h5py, netCDF4

**AI assistance:** Claude Code / Claude (Anthropic), <https://www.anthropic.com/claude-code>. See §16.

**Space Apps rules:** 2026 Project Submission Guide <https://www.spaceappschallenge.org/resources/project-submission-guide/> · 2026 Judging & Awards Guide <https://www.spaceappschallenge.org/resources/judging-awards-guide/>
