"""Optional Tier 3 30-day live NASA POWER service (`power_live.py`).

Implements the Execution Plan Section 0.7 date-slicing safeguard:
- Builds a dated `pandas.DataFrame` indexed by calendar date FIRST.
- Masks `-999` / fill values to `NaN` BEFORE slicing by date window (`7d`, `14d`, `30d`),
  preventing missing observations from shifting calendar lookback windows.
- Never invoked by `/api/v1/rotations/compare`.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import time
from typing import Any

import httpx
import numpy as np
import pandas as pd

from app.config import Settings
from app.models.schemas import FieldInfo, FieldProfile, NowResponse, NowStatus, Quality
from app.utils.validation import ProfileUnavailableError, is_valid_number

POWER_PARAMETERS = "PRECTOTCORR,T2M,T2M_MAX,T2M_MIN"
POWER_LAG_DAYS = 5

_LIVE_POWER_CACHE: dict[tuple[float, float, str], tuple[float, pd.DataFrame]] = {}


def clear_power_live_cache() -> None:
    """Clear in-memory live NASA POWER response cache."""
    _LIVE_POWER_CACHE.clear()


def parse_power_daily_payload(
    payload: dict[str, Any],
    *,
    start_date: date,
    end_date: date,
    variables: tuple[str, ...] = ("PRECTOTCORR", "T2M", "T2M_MAX", "T2M_MIN"),
) -> pd.DataFrame:
    """Parse NASA POWER JSON payload into a continuous dated DataFrame with `-999` masked as `NaN`."""
    try:
        param_block = payload["properties"]["parameter"]
    except (KeyError, TypeError) as exc:
        raise ProfileUnavailableError(
            "Malformed response payload received from NASA POWER daily API."
        ) from exc

    full_index = pd.date_range(start=start_date, end=end_date, freq="D")
    df = pd.DataFrame(index=full_index)

    for var in variables:
        raw_series = param_block.get(var, {})
        if not isinstance(raw_series, dict) or not raw_series:
            df[var] = np.nan
            continue
        # Vectorised parse: one to_datetime call for all keys (tens of thousands of days per request).
        idx = pd.to_datetime(pd.Index(list(raw_series.keys()), dtype="string"), format="%Y%m%d", errors="coerce")
        vals = pd.to_numeric(pd.Series(list(raw_series.values()), dtype="object"), errors="coerce").to_numpy(dtype="float64")
        keep = ~idx.isna()
        s = pd.Series(vals[keep], index=pd.DatetimeIndex(idx[keep]), dtype="float64")
        # Mask NASA POWER -999 / fill markers to NaN BEFORE any date window slicing
        s = s.where(np.isfinite(s) & (s > -990.0))
        s = s[~s.index.duplicated(keep="last")]
        df[var] = s.reindex(full_index)

    return df


def summarize_power_window(df: pd.DataFrame, *, end_date: date) -> dict[str, Any]:
    """Slice masked dated DataFrame strictly by calendar dates (`7d`, `14d`, `30d`)."""
    end_ts = pd.Timestamp(end_date)
    start_7d = end_ts - pd.Timedelta(days=6)
    start_14d = end_ts - pd.Timedelta(days=13)
    start_30d = end_ts - pd.Timedelta(days=29)

    win_7d = df.loc[start_7d:end_ts]
    win_14d = df.loc[start_14d:end_ts]
    win_30d = df.loc[start_30d:end_ts]

    def _safe_sum(series: pd.Series) -> float | None:
        valid = series.dropna()
        if len(valid) == 0:
            return None
        return round(float(valid.sum()), 2)

    def _safe_mean(series: pd.Series) -> float | None:
        valid = series.dropna()
        if len(valid) == 0:
            return None
        return round(float(valid.mean()), 2)

    def _safe_max(series: pd.Series) -> float | None:
        valid = series.dropna()
        if len(valid) == 0:
            return None
        return round(float(valid.max()), 2)

    latest_valid_rain = df["PRECTOTCORR"].dropna()
    latest_power_date = (
        latest_valid_rain.index[-1].strftime("%Y-%m-%d")
        if len(latest_valid_rain) > 0
        else None
    )

    return {
        "rain_7d_mm": _safe_sum(win_7d["PRECTOTCORR"]),
        "rain_14d_mm": _safe_sum(win_14d["PRECTOTCORR"]),
        "rain_30d_mm": _safe_sum(win_30d["PRECTOTCORR"]),
        "mean_temp_7d_c": _safe_mean(win_7d["T2M"]),
        "max_temp_7d_c": _safe_max(win_7d["T2M_MAX"]),
        "rootzone_latest_m3m3": None,
        "ndvi_latest": None,
        "latest_dates": {"power": latest_power_date},
    }


def classify_now_conditions(
    now_metrics: dict[str, Any],
    now_thresholds: dict[str, Any],
    irrigation: str,
) -> tuple[NowStatus, list[str]]:
    """Deterministically classify recent conditions into FAVORABLE | WATCH | STRESSED."""
    dry_rain_14d = float(now_thresholds.get("dry_rain_14d_mm", 5.0))
    heat_watch_c = float(now_thresholds.get("heat_watch_c", 35.0))
    heat_stress_c = float(now_thresholds.get("heat_stress_c", 40.0))
    rootzone_dry = float(now_thresholds.get("rootzone_dry_m3m3", 0.15))
    ndvi_low = float(now_thresholds.get("ndvi_low", 0.25))

    rain_14d = now_metrics.get("rain_14d_mm")
    max_temp_7d = now_metrics.get("max_temp_7d_c")
    rootzone = now_metrics.get("rootzone_latest_m3m3")
    ndvi = now_metrics.get("ndvi_latest")

    stress_reasons: list[str] = []
    watch_reasons: list[str] = []
    favorable_notes: list[str] = []

    is_dry_14d = is_valid_number(rain_14d) and float(rain_14d) < dry_rain_14d
    is_heat_stress = is_valid_number(max_temp_7d) and float(max_temp_7d) >= heat_stress_c
    is_heat_watch = (
        is_valid_number(max_temp_7d)
        and heat_watch_c <= float(max_temp_7d) < heat_stress_c
    )
    is_rootzone_dry = is_valid_number(rootzone) and float(rootzone) < rootzone_dry
    is_ndvi_low = is_valid_number(ndvi) and float(ndvi) < ndvi_low

    if is_heat_stress:
        stress_reasons.append(
            f"7-day maximum temperature ({float(max_temp_7d):.1f} C) reached or exceeded severe heat threshold ({heat_stress_c:.1f} C)."
        )
    elif is_heat_watch:
        watch_reasons.append(
            f"7-day maximum temperature ({float(max_temp_7d):.1f} C) reached elevated heat watch threshold ({heat_watch_c:.1f} C)."
        )

    if is_dry_14d:
        msg = f"14-day cumulative rainfall ({float(rain_14d):.1f} mm) is below {dry_rain_14d:.1f} mm."
        if irrigation != "reliable" and (is_heat_watch or is_rootzone_dry):
            stress_reasons.append(
                f"{msg} Combined heat/moisture deficit without reliable irrigation elevates short-term crop stress."
            )
        else:
            watch_reasons.append(msg)

    if is_rootzone_dry:
        if irrigation == "none" and is_dry_14d:
            stress_reasons.append(
                f"Latest root-zone soil moisture ({float(rootzone):.3f} m3/m3) is below {rootzone_dry:.2f} m3/m3 on unirrigated land."
            )
        else:
            watch_reasons.append(
                f"Latest root-zone soil moisture ({float(rootzone):.3f} m3/m3) is below {rootzone_dry:.2f} m3/m3."
            )

    if is_ndvi_low:
        watch_reasons.append(
            f"Latest vegetation index NDVI ({float(ndvi):.2f}) is below {ndvi_low:.2f} (sparse canopy or fallow surface)."
        )

    if stress_reasons:
        return "STRESSED", stress_reasons + watch_reasons
    if watch_reasons:
        return "WATCH", watch_reasons

    if is_valid_number(rain_14d):
        favorable_notes.append(
            f"14-day rainfall ({float(rain_14d):.1f} mm) meets or exceeds the {dry_rain_14d:.1f} mm watch threshold."
        )
    if is_valid_number(max_temp_7d):
        favorable_notes.append(
            f"7-day peak temperature ({float(max_temp_7d):.1f} C) remains below the {heat_watch_c:.1f} C heat watch threshold."
        )
    if not favorable_notes:
        favorable_notes.append(
            "Recent weather observations contain reporting lag gaps; no acute heat or drought thresholds were triggered."
        )
    return "FAVORABLE", favorable_notes


def fetch_and_evaluate_now(
    *,
    field: FieldInfo,
    parameters: dict[str, Any],
    settings: Settings,
    local_profile: FieldProfile | None = None,
    reference_date: date | None = None,
    http_client: httpx.Client | None = None,
) -> NowResponse:
    """Fetch/cache 30-day NASA POWER window and return structured Tier 3 `NowResponse`."""
    ref_day = reference_date or datetime.now(timezone.utc).date()
    end_date = ref_day - timedelta(days=POWER_LAG_DAYS)
    start_date = end_date - timedelta(days=29)

    cache_key = (
        round(float(field.location.lat), 4),
        round(float(field.location.lon), 4),
        end_date.isoformat(),
    )
    now_epoch = time.monotonic()

    cached_entry = _LIVE_POWER_CACHE.get(cache_key)
    df: pd.DataFrame | None = None
    if cached_entry is not None:
        cached_at, cached_df = cached_entry
        if now_epoch - cached_at <= float(settings.power_cache_ttl_seconds):
            df = cached_df

    live_succeeded = False
    if df is not None:
        live_succeeded = True
    else:
        query_params = {
            "parameters": POWER_PARAMETERS,
            "community": "AG",
            "longitude": field.location.lon,
            "latitude": field.location.lat,
            "start": start_date.strftime("%Y%m%d"),
            "end": end_date.strftime("%Y%m%d"),
            "format": "JSON",
        }
        try:
            if http_client is not None:
                resp = http_client.get(
                    settings.nasa_power_base_url,
                    params=query_params,
                    timeout=settings.nasa_power_timeout_seconds,
                )
            else:
                with httpx.Client(timeout=settings.nasa_power_timeout_seconds) as client:
                    resp = client.get(settings.nasa_power_base_url, params=query_params)
            resp.raise_for_status()
            payload = resp.json()
            df = parse_power_daily_payload(
                payload,
                start_date=start_date,
                end_date=end_date,
            )
            if settings.power_cache_ttl_seconds > 0:
                _LIVE_POWER_CACHE[cache_key] = (now_epoch, df)
            live_succeeded = True
        except (httpx.HTTPError, ValueError, ProfileUnavailableError) as exc:
            if local_profile is None or not local_profile.now:
                raise ProfileUnavailableError(
                    f"Live NASA POWER service is unavailable and no cached local `now` profile exists for '{field.field_id}': {exc}"
                ) from exc

    if live_succeeded and df is not None:
        now_metrics = summarize_power_window(df, end_date=end_date)
        response_mode: str = "observed"
        sources: dict[str, str] = {"power": "NASA POWER daily point API (community=AG)"}
        quality: dict[str, Quality] = {
            "rain_7d_mm": "observed" if now_metrics["rain_7d_mm"] is not None else "unavailable",
            "rain_14d_mm": "observed" if now_metrics["rain_14d_mm"] is not None else "unavailable",
            "rain_30d_mm": "observed" if now_metrics["rain_30d_mm"] is not None else "unavailable",
            "mean_temp_7d_c": "observed" if now_metrics["mean_temp_7d_c"] is not None else "unavailable",
            "max_temp_7d_c": "observed" if now_metrics["max_temp_7d_c"] is not None else "unavailable",
            "rootzone_latest_m3m3": "unavailable",
            "ndvi_latest": "unavailable",
        }

        # Supplement SMAP/MODIS latest values only from an observed local profile (never mix demo as observed)
        if local_profile is not None and local_profile.data_mode == "observed":
            rz = local_profile.now.get("rootzone_latest_m3m3")
            ndvi = local_profile.now.get("ndvi_latest")
            if is_valid_number(rz):
                now_metrics["rootzone_latest_m3m3"] = float(rz)  # type: ignore[arg-type]
                quality["rootzone_latest_m3m3"] = local_profile.data_quality.get("smap", "observed")
                sources["smap"] = local_profile.data_sources.get("smap", "SMAP L4 SPL4SMGP v007")
            if is_valid_number(ndvi):
                now_metrics["ndvi_latest"] = float(ndvi)  # type: ignore[arg-type]
                quality["ndvi_latest"] = local_profile.data_quality.get("modis", "observed")
                sources["modis"] = local_profile.data_sources.get("modis", "MODIS MOD13Q1 v061")
    else:
        assert local_profile is not None
        now_metrics = dict(local_profile.now)
        response_mode = local_profile.data_mode
        sources = dict(local_profile.data_sources)
        fallback_q: Quality = "demo" if response_mode == "demo" else "observed"
        quality = {
            k: (fallback_q if v is not None else "unavailable")
            for k, v in now_metrics.items()
            if k != "latest_dates"
        }

    status, reasons = classify_now_conditions(
        now_metrics=now_metrics,
        now_thresholds=parameters.get("now", {}),
        irrigation=field.irrigation,
    )
    quality["now_status"] = "demo" if response_mode == "demo" else "derived"

    disclaimer = (
        "30-day 'Right now' weather summary is for short-term situational context only and cannot support "
        "multi-season crop-rotation selection; use the 10–20 year historical rotation comparison for strategy decisions."
    )

    return NowResponse(
        field_id=field.field_id,
        now_status=status,
        now_reasons=reasons,
        window_start=start_date.isoformat() if live_succeeded else None,
        window_end=end_date.isoformat() if live_succeeded else None,
        now=now_metrics,
        data_mode="demo" if response_mode == "demo" else "observed",
        data_sources=sources,
        data_quality=quality,
        disclaimer=disclaimer,
    )
