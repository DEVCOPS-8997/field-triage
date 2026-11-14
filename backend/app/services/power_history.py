"""Historical daily NASA POWER retrieval for arbitrary coordinates, with a disk cache.

Caching design
- Key: a 0.5-degree grid cell. Every point in a cell is served from ONE request made at the cell
  centre, so nearby coordinates never trigger duplicate NASA calls and always get identical data.
  (POWER is gridded at roughly this scale; this is an approximation of its native grid.)
- Storage: one JSON file per cell under `power_cache_dir`, written atomically.
- Refresh: the historical part is never refetched. When the entry is older than
  `power_history_ttl_hours`, only the last REFRESH_OVERLAP_DAYS (plus anything newer) are refetched
  and merged.
- Concurrency: one lock per cell, so simultaneous requests for a cell cause a single fetch.
- Failure: if a refresh fails, the cached data is returned and flagged `stale`. If there is no
  cache either, a ProfileUnavailableError (HTTP 503) is raised.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import json
import math
import os
from pathlib import Path
import threading
from typing import Any

import httpx
import pandas as pd

from app.config import Settings
from app.services.power_live import parse_power_daily_payload
from app.utils.validation import ProfileUnavailableError

POWER_PARAMETERS = ("PRECTOTCORR", "T2M", "T2M_MAX", "T2M_MIN")
GRID_DEG = 0.5
POWER_LAG_DAYS = 5  # POWER publishes with a few days' delay (same rule as pipeline/common.py)
REFRESH_OVERLAP_DAYS = 30

_locks_guard = threading.Lock()
_cell_locks: dict[str, threading.Lock] = {}


@dataclass(frozen=True)
class PowerHistory:
    df: pd.DataFrame  # index = daily DatetimeIndex; columns = POWER_PARAMETERS; NaN = missing
    cell: dict[str, Any]
    fetched_at: str
    source: str  # "live" | "cache" | "refreshed" | "stale_cache"
    start: str
    end: str
    warning: str | None = None


def grid_cell(lat: float, lon: float) -> tuple[int, int, float, float]:
    """Return (i, j, centre_lat, centre_lon) of the 0.5-degree cell containing the point."""
    i = math.floor(lat / GRID_DEG)
    j = math.floor(lon / GRID_DEG)
    return i, j, round(i * GRID_DEG + GRID_DEG / 2, 4), round(j * GRID_DEG + GRID_DEG / 2, 4)


def _lock_for(key: str) -> threading.Lock:
    with _locks_guard:
        return _cell_locks.setdefault(key, threading.Lock())


def _cache_path(settings: Settings, i: int, j: int) -> Path:
    return Path(settings.power_cache_dir) / f"power_{i}_{j}.json"


def _request_power(settings: Settings, params: dict[str, Any]) -> dict[str, Any]:
    """Single NASA POWER HTTP call. Isolated so tests can replace it."""
    with httpx.Client(timeout=settings.power_history_timeout_seconds) as client:
        resp = client.get(settings.nasa_power_base_url, params=params)
    resp.raise_for_status()
    return resp.json()


def _fetch(settings: Settings, lat_c: float, lon_c: float, start: date, end: date) -> dict[str, dict[str, float]]:
    params = {
        "parameters": ",".join(POWER_PARAMETERS),
        "community": "AG",
        "longitude": lon_c,
        "latitude": lat_c,
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "format": "JSON",
    }
    try:
        payload = _request_power(settings, params)
        block = payload["properties"]["parameter"]
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise ProfileUnavailableError(f"NASA POWER request failed: {exc}") from exc
    return {v: dict(block.get(v, {})) for v in POWER_PARAMETERS}


def _read_cache(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None  # missing or corrupt: treated as no cache


def _write_cache(path: Path, entry: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_text(json.dumps(entry), encoding="utf-8")
    os.replace(tmp, path)


def _frame(entry: dict[str, Any]) -> pd.DataFrame:
    start = date.fromisoformat(entry["start"])
    end = date.fromisoformat(entry["end"])
    return parse_power_daily_payload(
        {"properties": {"parameter": entry["data"]}}, start_date=start, end_date=end
    )


def _age_hours(entry: dict[str, Any], now: datetime) -> float:
    try:
        return (now - datetime.fromisoformat(entry["fetched_at"])).total_seconds() / 3600
    except (KeyError, ValueError):
        return float("inf")


def get_power_history(
    lat: float, lon: float, settings: Settings, *, now: datetime | None = None
) -> PowerHistory:
    """Daily NASA POWER history (start year .. today-5d) for the grid cell containing the point."""
    now = now or datetime.now(timezone.utc)
    i, j, lat_c, lon_c = grid_cell(lat, lon)
    cell = {
        "i": i, "j": j, "center_lat": lat_c, "center_lon": lon_c, "size_deg": GRID_DEG,
    }
    start = date(settings.power_history_start_year, 1, 1)
    end = now.date() - timedelta(days=POWER_LAG_DAYS)
    path = _cache_path(settings, i, j)

    with _lock_for(f"{i}_{j}"):
        entry = _read_cache(path)
        if entry and entry.get("start") != start.isoformat():
            entry = None  # configured history period changed: rebuild
        source = "cache"
        warning = None

        if entry is None:
            try:
                data = _fetch(settings, lat_c, lon_c, start, end)
            except ProfileUnavailableError as exc:
                raise ProfileUnavailableError(
                    f"{exc}. No cached NASA POWER data exists for this location yet."
                ) from exc
            entry = {
                "start": start.isoformat(), "end": end.isoformat(), "data": data,
                "fetched_at": now.isoformat(), "center": [lat_c, lon_c],
            }
            _write_cache(path, entry)
            source = "live"
        elif _age_hours(entry, now) > settings.power_history_ttl_hours and entry["end"] < end.isoformat():
            cached_end = date.fromisoformat(entry["end"])
            refresh_from = max(start, cached_end - timedelta(days=REFRESH_OVERLAP_DAYS))
            try:
                fresh = _fetch(settings, lat_c, lon_c, refresh_from, end)
                for var in POWER_PARAMETERS:
                    entry["data"].setdefault(var, {}).update(fresh[var])
                entry["end"] = end.isoformat()
                entry["fetched_at"] = now.isoformat()
                _write_cache(path, entry)
                source = "refreshed"
            except ProfileUnavailableError as exc:
                source = "stale_cache"
                warning = (
                    f"Could not refresh NASA POWER ({exc}); using cached data fetched "
                    f"{entry.get('fetched_at', 'at an unknown time')} (latest day {entry['end']})."
                )
        elif _age_hours(entry, now) > settings.power_history_ttl_hours:
            # Cache is old but already reaches the latest published day: nothing newer exists.
            pass

        return PowerHistory(
            df=_frame(entry), cell=cell, fetched_at=entry["fetched_at"], source=source,
            start=entry["start"], end=entry["end"], warning=warning,
        )


def clear_power_history_memory() -> None:
    """Reset in-process locks (cache files are left alone)."""
    with _locks_guard:
        _cell_locks.clear()
