"""Build an observed FieldProfile from M1's integrated NASA daily CSV (data/processed/<id>/...).

No values are invented: missing observations stay None, months with insufficient daily
coverage become None, and sources M1 did not deliver (SoilGrids, SRTM) are marked unavailable.
"""

from __future__ import annotations

import calendar
import json
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

from app.models.schemas import FieldProfile
from app.utils.validation import ProfileUnavailableError

MIN_MONTH_COVERAGE = 0.8  # fraction of days required to report a monthly statistic
GOOD_MODIS_QA = (0, 1)  # SummaryQA 0=good, 1=marginal; 2=snow/ice, 3=cloudy are excluded
HEAT_THRESHOLDS = (30, 34, 38, 42)
REQUIRED_COLS = {"date", "PRECTOTCORR", "T2M", "T2M_MAX", "T2M_MIN", "sm_rootzone"}


def csv_path(processed_dir: Path, field_id: str) -> Path:
    return processed_dir / field_id / f"{field_id}_nasa_integrated_daily.csv"


def _f(x: Any, nd: int = 3) -> Optional[float]:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(v) else round(v, nd)


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _max_dry_spell(rain: pd.Series) -> int:
    best = run = 0
    for v in rain:
        if pd.notna(v) and v < 1.0:
            run += 1
            best = max(best, run)
        else:
            run = 0
    return best


def _slope_per_decade(years: list[int], vals: list[float]) -> Optional[float]:
    if len(years) < 5:
        return None
    return _f(np.polyfit(years, vals, 1)[0] * 10, 2)


def build_profile(field_id: str, processed_dir: Path) -> FieldProfile:
    path = csv_path(processed_dir, field_id)
    if not path.is_file():
        raise ProfileUnavailableError(
            f"No observed NASA data is available for field '{field_id}' (expected '{path.name}'). "
            "Only fields with M1 pipeline output have observed data; use DATA_MODE=demo for demo profiles."
        )
    try:
        df = pd.read_csv(path, parse_dates=["date"])
    except (OSError, ValueError) as exc:
        raise ProfileUnavailableError(f"Failed to read '{path}': {exc}") from exc
    missing = REQUIRED_COLS - set(df.columns)
    if missing or df.empty:
        raise ProfileUnavailableError(f"'{path.name}' is empty or missing columns: {sorted(missing)}")

    df = df.drop_duplicates("date").sort_values("date").reset_index(drop=True)
    for c in df.columns:
        if c not in ("date", "MODIS_composite_date"):
            df[c] = pd.to_numeric(df[c], errors="coerce")
    raw_dir = processed_dir.parent / "raw" / field_id
    power_meta = _read_json(raw_dir / "power_metadata.json")
    smap_meta = _read_json(raw_dir / "smap_metadata.json")

    df["year"] = df.date.dt.year
    df["month"] = df.date.dt.month

    # MODIS: one value per 16-day composite (the CSV forward-fills it across days), QA-filtered.
    modis = pd.DataFrame()
    if {"NDVI", "MODIS_composite_date", "SummaryQA"} <= set(df.columns):
        m = df.dropna(subset=["NDVI", "MODIS_composite_date"]).copy()
        m["comp"] = pd.to_datetime(m["MODIS_composite_date"], errors="coerce")
        m = m.dropna(subset=["comp"])
        m = m[m.SummaryQA.isin(GOOD_MODIS_QA)].drop_duplicates("comp")
        m["year"], m["month"] = m.comp.dt.year, m.comp.dt.month
        modis = m

    monthly: list[dict[str, Any]] = []
    for (y, mo), g in df.groupby(["year", "month"]):
        ndays = calendar.monthrange(int(y), int(mo))[1]
        full = len(g) / ndays >= MIN_MONTH_COVERAGE
        rec: dict[str, Any] = {"year": int(y), "month": int(mo), "heat_days_ge": {}}
        if full:
            scale = ndays / len(g)  # scale counts if a few days are absent
            rain = g.PRECTOTCORR
            rec.update(
                rain_mm=_f(rain.sum(min_count=1) * scale if rain.notna().any() else None, 1),
                tmean_c=_f(g.T2M.mean(), 2),
                tmax_mean_c=_f(g.T2M_MAX.mean(), 2),
                tmin_mean_c=_f(g.T2M_MIN.mean(), 2),
                heat_days_ge={str(t): int(round((g.T2M_MAX >= t).sum() * scale)) for t in HEAT_THRESHOLDS},
                frost_days_le_0c=int(round((g.T2M_MIN <= 0).sum() * scale)),
                dry_days_lt_1mm=int(round((rain < 1.0).sum() * scale)),
                smap_rootzone_m3m3=_f(g.sm_rootzone.mean(), 4),
            )
        mm = modis[(modis.year == y) & (modis.month == mo)] if not modis.empty else modis
        rec["ndvi_mean"] = _f(mm.NDVI.mean(), 3) if len(mm) else None
        if full or rec["ndvi_mean"] is not None:
            monthly.append(rec)
    if not monthly:
        raise ProfileUnavailableError(f"'{path.name}' has no month with sufficient coverage.")

    # Complete calendar years only for annual statistics.
    cover = df.groupby("year").size()
    full_years = [int(y) for y, n in cover.items() if n >= 360]
    ann = df[df.year.isin(full_years)]
    rain_ann = ann.groupby("year").PRECTOTCORR.sum()
    tmean_ann = ann.groupby("year").T2M.mean()
    clim: dict[str, Any] = {}
    if len(full_years) >= 3:
        clim["rain_annual_mm_mean"] = _f(rain_ann.mean(), 1)
        clim["rain_annual_cv"] = _f(rain_ann.std(ddof=1) / rain_ann.mean(), 3)
        clim["rain_trend_mm_per_decade"] = _slope_per_decade(full_years, list(rain_ann.values))
        clim["tmean_trend_c_per_decade"] = _slope_per_decade(full_years, list(tmean_ann.values))
        clim["dry_spell_max_days_mean"] = _f(
            np.mean([_max_dry_spell(g.PRECTOTCORR) for _, g in ann.groupby("year")]), 1
        )
        clim["heavy_rain_days_ge_25mm_mean"] = _f((ann.PRECTOTCORR >= 25).groupby(ann.year).sum().mean(), 2)
        # Approximation from daily mean temperature (T2M), not hourly GDD.
        clim["gdd_base10_annual_mean"] = _f((ann.T2M - 10).clip(lower=0).groupby(ann.year).sum().mean(), 0)
    sm = df.sm_rootzone.dropna()
    if len(sm):
        clim["smap_rootzone_mean_m3m3"] = _f(sm.mean(), 4)
        clim["smap_rootzone_p10_m3m3"] = _f(sm.quantile(0.10), 4)
    if not modis.empty:
        clim["ndvi_monthly_mean"] = [
            _f(modis[modis.month == k].NDVI.mean(), 3) if (modis.month == k).any() else None
            for k in range(1, 13)
        ]
        peaks = modis[modis.year.isin(full_years)].groupby("year").NDVI.max()
        if len(peaks):
            clim["ndvi_peak_mean"] = _f(peaks.mean(), 3)
            doy = modis[modis.year.isin(full_years)].loc[
                modis[modis.year.isin(full_years)].groupby("year").NDVI.idxmax(), "comp"
            ].dt.dayofyear
            clim["ndvi_peak_doy_mean"] = _f(doy.mean(), 0)
    # Not derivable from M1 data (no ETo, no frost season in this record, no bare-soil classification):
    # bare_days_est_mean, eto_annual_mm_mean, water_deficit_annual_mm_mean, smap_dry_days_frac,
    # smap_drydown_rate, frost doy percentiles are intentionally omitted (missing, not zero).

    # "Now" window anchored on the last available observation of each source.
    last = df.date.max()
    def win(days: int) -> pd.DataFrame:
        return df[df.date > last - pd.Timedelta(days=days)]
    now: dict[str, Any] = {
        "rain_7d_mm": _f(win(7).PRECTOTCORR.sum(min_count=1), 1),
        "rain_14d_mm": _f(win(14).PRECTOTCORR.sum(min_count=1), 1),
        "rain_30d_mm": _f(win(30).PRECTOTCORR.sum(min_count=1), 1),
        "mean_temp_7d_c": _f(win(7).T2M.mean(), 2),
        "max_temp_7d_c": _f(win(7).T2M_MAX.max(), 2),
        "rootzone_latest_m3m3": _f(sm.iloc[-1], 4) if len(sm) else None,
        "ndvi_latest": _f(modis.sort_values("comp").NDVI.iloc[-1], 3) if not modis.empty else None,
        "latest_dates": {
            "power": last.strftime("%Y-%m-%d"),
            "smap": df.loc[df.sm_rootzone.notna(), "date"].max().strftime("%Y-%m-%d") if len(sm) else None,
            **({"modis": modis.comp.max().strftime("%Y-%m-%d")} if not modis.empty else {}),
        },
    }
    now["latest_dates"] = {k: v for k, v in now["latest_dates"].items() if v}

    first_m, last_m = monthly[0], monthly[-1]
    have_modis = not modis.empty
    sources = {
        "power": (
            f"NASA POWER daily (gridded ~0.5° reanalysis/satellite-derived, not field sensors); "
            f"retrieved {power_meta.get('retrieved_on', 'unknown')} at lat {power_meta.get('latitude')}, lon {power_meta.get('longitude')}"
        ),
        "smap": (
            f"{smap_meta.get('source', 'NASA SMAP L4')} root-zone soil moisture, daily mean of 3-hourly values; "
            f"~9-11 km grid cell, so a regional estimate, not a field-level measurement; "
            f"retrieved {smap_meta.get('retrieved_on', 'unknown')}"
        ),
        "modis": (
            "MODIS MOD13Q1 NDVI (~250 m, 16-day composite, SummaryQA 0/1 only); not an instantaneous measurement"
            if have_modis else "MODIS NDVI not available"
        ),
        "soil": "Not available: SoilGrids layer not delivered by M1 pipeline",
        "terrain": "Not available: terrain (SRTM) layer not delivered by M1 pipeline",
    }
    quality = {
        "power": "observed",
        "smap": "observed" if len(sm) else "unavailable",
        "modis": "observed" if have_modis else "unavailable",
        "soil": "unavailable",
        "terrain": "unavailable",
    }
    raw = {
        "field_id": field_id,
        "period_start": f"{first_m['year']:04d}-{first_m['month']:02d}",
        "period_end": f"{last_m['year']:04d}-{last_m['month']:02d}",
        "n_years": len(full_years),
        "monthly": monthly,
        "climatology": clim,
        "soil": {"soil_clay_pct": None, "soil_sand_pct": None, "soil_soc_g_kg": None, "soil_ph": None},
        "terrain": {"elevation_m": None, "slope_deg": None},
        "now": now,
        "data_mode": "observed",
        "data_sources": sources,
        "data_quality": quality,
    }
    return FieldProfile.model_validate(raw)
