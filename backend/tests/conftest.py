"""Shared deterministic pytest fixtures for Field Shift Advisor M2 backend tests.

All synthetic fixtures in unit/integration tests are explicitly tagged as synthetic
and never misrepresent synthetic values as real NASA observations.
"""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import sys
from typing import Any

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
REAL_DATA_DIR = REPO_ROOT / "data"

if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import Settings, get_settings  # noqa: E402
from app.models.schemas import FieldProfile, MonthRecord, Quality  # noqa: E402
from app.services.data_loader import DataLoader, clear_data_cache  # noqa: E402
from app.services.power_live import clear_power_live_cache  # noqa: E402


@pytest.fixture(autouse=True)
def _offline_reverse_geocode(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests never call OpenStreetMap: overlapping provinces resolve by regions.json file order."""
    monkeypatch.setattr("app.services.admin_region.lookup_state", lambda settings, lat, lon: None)
    # MODIS NDVI providers stay offline too: ORNL unreachable, no Earthdata login -> not_configured.
    monkeypatch.setattr("app.services.modis_ndvi.ornl_reachable", lambda settings: False)
    monkeypatch.setattr("app.services.modis_ndvi.appeears_configured", lambda settings: False)


@pytest.fixture(autouse=True)
def _reset_service_caches() -> Any:
    """Ensure every test runs with clean static-catalog and live-POWER caches."""
    clear_data_cache()
    clear_power_live_cache()
    yield
    clear_data_cache()
    clear_power_live_cache()


def build_synthetic_monthly_records(
    *,
    region_id: str,
    start_year: int = 2014,
    n_years: int = 12,
) -> list[dict[str, Any]]:
    """Generate deterministic multi-year monthly climate records with inter-annual spread."""
    punjab_base_rain = {
        1: 18.0,
        2: 26.0,
        3: 32.0,
        4: 18.0,
        5: 15.0,
        6: 48.0,
        7: 125.0,
        8: 105.0,
        9: 55.0,
        10: 9.0,
        11: 6.0,
        12: 11.0,
    }
    punjab_base_tmean = {
        1: 12.4,
        2: 15.6,
        3: 21.2,
        4: 27.5,
        5: 32.8,
        6: 35.0,
        7: 32.5,
        8: 31.3,
        9: 29.4,
        10: 25.0,
        11: 18.8,
        12: 13.6,
    }
    midwest_base_rain = {
        1: 28.0,
        2: 32.0,
        3: 58.0,
        4: 92.0,
        5: 118.0,
        6: 126.0,
        7: 108.0,
        8: 98.0,
        9: 82.0,
        10: 66.0,
        11: 48.0,
        12: 34.0,
    }
    midwest_base_tmean = {
        1: -5.2,
        2: -2.6,
        3: 4.5,
        4: 11.2,
        5: 17.4,
        6: 22.6,
        7: 24.8,
        8: 23.6,
        9: 19.1,
        10: 12.2,
        11: 4.6,
        12: -2.4,
    }

    is_punjab = region_id == "pk_punjab"
    base_rain = punjab_base_rain if is_punjab else midwest_base_rain
    base_tmean = punjab_base_tmean if is_punjab else midwest_base_tmean

    # Deterministic inter-annual multipliers for realistic 10th-90th percentile spread
    rain_factors = [0.72, 0.85, 0.94, 1.02, 1.15, 0.78, 1.08, 0.91, 1.22, 0.88, 1.05, 0.97]
    heat_offsets = [3, 1, 0, -1, -2, 4, -1, 1, -2, 2, 0, 0]

    records: list[dict[str, Any]] = []
    for idx in range(n_years):
        yr = start_year + idx
        rf = rain_factors[idx % len(rain_factors)]
        ho = heat_offsets[idx % len(heat_offsets)]

        for mo in range(1, 13):
            rain = round(base_rain[mo] * rf, 1)
            tmean = round(base_tmean[mo] + (0.4 * ho), 1)
            tmax = round(tmean + 6.8, 1)
            tmin = round(tmean - 6.8, 1)

            if is_punjab:
                h30 = max(0, min(30, int((tmax - 26.0) * 1.8) + ho)) if mo in range(3, 11) else 0
                h34 = max(0, min(28, int((tmax - 31.0) * 1.7) + ho)) if mo in range(4, 11) else 0
                h38 = max(0, min(22, int((tmax - 35.5) * 1.6) + ho)) if mo in (5, 6, 7, 8) else 0
                h42 = max(0, min(10, int((tmax - 39.5) * 1.4) + max(0, ho))) if mo in (5, 6) else 0
                frost = 1 if (mo in (1, 12) and ho <= -2) else 0
            else:
                h30 = max(0, min(22, int((tmax - 26.0) * 2.0) + ho)) if mo in (6, 7, 8, 9) else 0
                h34 = max(0, min(12, int((tmax - 29.5) * 1.5) + ho)) if mo in (6, 7, 8) else 0
                h38 = max(0, min(5, ho)) if mo == 7 else 0
                h42 = 0
                frost = (
                    22
                    if mo in (1, 2, 12)
                    else (12 if mo in (3, 11) else (2 if (mo == 4 and ho >= 3) else 0))
                )

            smap_val = round(0.18 + (0.04 * rf), 3) if yr >= 2015 else None
            ndvi_val = round(0.22 + 0.35 * ((mo % 6) / 5.0), 2)

            records.append(
                {
                    "year": yr,
                    "month": mo,
                    "rain_mm": rain,
                    "tmean_c": tmean,
                    "tmax_mean_c": tmax,
                    "tmin_mean_c": tmin,
                    "heat_days_ge": {"30": h30, "34": h34, "38": h38, "42": h42},
                    "frost_days_le_0c": frost,
                    "dry_days_lt_1mm": max(5, 30 - int(rain / 8.0)),
                    "smap_rootzone_m3m3": smap_val,
                    "ndvi_mean": ndvi_val,
                }
            )
    return records


def make_synthetic_profile_dict(
    *,
    field_id: str = "F01",
    region_id: str = "pk_punjab",
    data_mode: str = "demo",
    n_years: int = 12,
    start_year: int = 2014,
    pillar_qualities: dict[str, Quality] | None = None,
) -> dict[str, Any]:
    """Create a schema-valid synthetic FieldProfile dictionary for isolated tests."""
    default_q: Quality = "demo" if data_mode == "demo" else "observed"
    qualities: dict[str, Quality] = {
        "power": default_q,
        "smap": default_q,
        "modis": default_q,
        "soil": default_q,
        "terrain": default_q,
    }
    if pillar_qualities:
        qualities.update(pillar_qualities)

    monthly = build_synthetic_monthly_records(
        region_id=region_id, start_year=start_year, n_years=n_years
    )

    if qualities.get("smap") == "unavailable":
        for rec in monthly:
            rec["smap_rootzone_m3m3"] = None
    if qualities.get("modis") == "unavailable":
        for rec in monthly:
            rec["ndvi_mean"] = None

    is_punjab = region_id == "pk_punjab"
    climatology: dict[str, Any] = {
        "rain_annual_mm_mean": 468.0 if is_punjab else 890.0,
        "rain_annual_cv": 0.24 if is_punjab else 0.16,
        "rain_trend_mm_per_decade": -12.0 if is_punjab else 18.5,
        "tmean_trend_c_per_decade": 0.32 if is_punjab else 0.25,
        "dry_spell_max_days_mean": 38.0 if is_punjab else 16.0,
        "heavy_rain_days_ge_25mm_mean": 2.5 if is_punjab else 4.2,
        "last_spring_frost_doy_p50": 15.0 if is_punjab else 108.0,
        "first_autumn_frost_doy_p50": 356.0 if is_punjab else 286.0,
        "gdd_base10_annual_mean": 4820.0 if is_punjab else 1950.0,
        "eto_annual_mm_mean": 1650.0 if is_punjab else 980.0,
        "water_deficit_annual_mm_mean": 1182.0 if is_punjab else 190.0,
        "smap_rootzone_mean_m3m3": None if qualities["smap"] == "unavailable" else (0.19 if is_punjab else 0.29),
        "smap_rootzone_p10_m3m3": None if qualities["smap"] == "unavailable" else (0.13 if is_punjab else 0.21),
        "smap_dry_days_frac": None if qualities["smap"] == "unavailable" else 0.22,
        "smap_drydown_rate": None if qualities["smap"] == "unavailable" else -0.007,
        "ndvi_monthly_mean": (
            None
            if qualities["modis"] == "unavailable"
            else [0.45, 0.58, 0.64, 0.36, 0.21, 0.28, 0.49, 0.61, 0.55, 0.33, 0.24, 0.37]
        ),
        "ndvi_peak_mean": None if qualities["modis"] == "unavailable" else 0.72,
        "ndvi_peak_doy_mean": None if qualities["modis"] == "unavailable" else 210.0,
        "bare_days_est_mean": None if qualities["modis"] == "unavailable" else (75.0 if is_punjab else 145.0),
    }

    soil = (
        {"soil_clay_pct": None, "soil_sand_pct": None, "soil_soc_g_kg": None, "soil_ph": None}
        if qualities["soil"] == "unavailable"
        else {"soil_clay_pct": 27.0, "soil_sand_pct": 35.0, "soil_soc_g_kg": 8.5, "soil_ph": 7.4}
    )
    terrain = (
        {"elevation_m": None, "slope_deg": None}
        if qualities["terrain"] == "unavailable"
        else {"elevation_m": 210.0, "slope_deg": 1.8}
    )

    label_prefix = "Synthetic demo fixture" if data_mode == "demo" else "Synthetic test fixture"
    sources = {
        "power": f"{label_prefix} — POWER",
        "smap": f"{label_prefix} — SMAP L4",
        "modis": f"{label_prefix} — MODIS MOD13Q1",
        "soil": f"{label_prefix} — SoilGrids",
        "terrain": f"{label_prefix} — SRTM",
    }

    return {
        "field_id": field_id,
        "period_start": f"{start_year}-01",
        "period_end": f"{start_year + n_years - 1}-12",
        "n_years": n_years,
        "monthly": monthly,
        "climatology": climatology,
        "soil": soil,
        "terrain": terrain,
        "now": {
            "rain_7d_mm": 4.0,
            "rain_14d_mm": 9.5,
            "rain_30d_mm": 28.0,
            "mean_temp_7d_c": 24.0,
            "max_temp_7d_c": 31.0,
            "rootzone_latest_m3m3": None if qualities["smap"] == "unavailable" else 0.22,
            "ndvi_latest": None if qualities["modis"] == "unavailable" else 0.44,
            "latest_dates": {"power": f"{start_year + n_years - 1}-12-26"},
        },
        "data_mode": data_mode,
        "data_sources": sources,
        "data_quality": qualities,
    }


@pytest.fixture
def real_catalog() -> Any:
    """Load the actual committed M3 datasets from `data/` without modifying them."""
    loader = DataLoader(settings=get_settings(data_mode="demo", data_dir=REAL_DATA_DIR))
    return loader.load_catalog()


@pytest.fixture
def sandbox_data_dir(tmp_path: Path) -> Path:
    """Isolated temporary copy of M3's `data/*.json` populated with synthetic demo & processed profiles."""
    target = tmp_path / "data"
    target.mkdir(parents=True, exist_ok=True)

    for fname in (
        "fields.json",
        "crops.json",
        "rotations.json",
        "parameters.json",
        "nasa_metadata.json",
        "regions.json",
    ):
        shutil.copy2(REAL_DATA_DIR / fname, target / fname)

    fields_raw = json.loads((target / "fields.json").read_text(encoding="utf-8"))
    demo_dir = target / "demo" / "profiles"
    demo_dir.mkdir(parents=True, exist_ok=True)
    processed_root = target / "processed"
    processed_root.mkdir(parents=True, exist_ok=True)

    for f_item in fields_raw:
        fid = f_item["field_id"]
        reg = f_item["region_id"]

        demo_payload = make_synthetic_profile_dict(
            field_id=fid, region_id=reg, data_mode="demo"
        )
        (demo_dir / f"{fid}.json").write_text(
            json.dumps(demo_payload), encoding="utf-8"
        )

        obs_dir = processed_root / fid
        obs_dir.mkdir(parents=True, exist_ok=True)
        obs_payload = make_synthetic_profile_dict(
            field_id=fid, region_id=reg, data_mode="observed"
        )
        (obs_dir / "profile.json").write_text(
            json.dumps(obs_payload), encoding="utf-8"
        )

    return target


@pytest.fixture
def demo_settings(sandbox_data_dir: Path) -> Settings:
    return get_settings(data_mode="demo", data_dir=sandbox_data_dir)


@pytest.fixture
def processed_settings(sandbox_data_dir: Path) -> Settings:
    return get_settings(data_mode="processed", data_dir=sandbox_data_dir)


@pytest.fixture
def f01_demo_profile() -> FieldProfile:
    return FieldProfile.model_validate(
        make_synthetic_profile_dict(field_id="F01", region_id="pk_punjab", data_mode="demo")
    )


@pytest.fixture
def f05_demo_profile() -> FieldProfile:
    return FieldProfile.model_validate(
        make_synthetic_profile_dict(field_id="F05", region_id="us_midwest", data_mode="demo")
    )
