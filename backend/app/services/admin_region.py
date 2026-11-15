"""Province lookup for points where approximate region rectangles overlap.

Region rectangles in `regions.json` overlap along provincial borders (e.g. Punjab / KP / Balochistan).
When a point falls in more than one rectangle, the province is read from OpenStreetMap Nominatim
reverse geocoding (`address.state`) and matched to each region's `admin_names`. Results are cached
on disk per ~1 km cell, and requests respect Nominatim's 1 request/second policy.

If reverse geocoding is unavailable, the caller falls back to a deterministic geometric rule.
"""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path

import httpx

from app.config import Settings

NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_UA = "FieldTriage/1.0 (crop-rotation decision-support tool)"

_lock = threading.Lock()
_last = [0.0]


def _cache_path(settings: Settings, lat: float, lon: float) -> Path:
    return settings.location_data_cache_dir / f"admin_{lat:.2f}_{lon:.2f}.json"


def lookup_state(settings: Settings, lat: float, lon: float) -> str | None:
    """Return the first-level administrative name (province/state) for a point, or None."""
    path = _cache_path(settings, lat, lon)
    if path.is_file():
        try:
            return json.loads(path.read_text(encoding="utf-8")).get("state")
        except (OSError, ValueError):
            pass
    with _lock:
        wait = 1.0 - (time.monotonic() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()
    try:
        resp = httpx.get(
            NOMINATIM_REVERSE_URL,
            params={"lat": f"{lat:.5f}", "lon": f"{lon:.5f}", "format": "jsonv2", "zoom": 5},
            headers={"User-Agent": NOMINATIM_UA, "Accept-Language": "en"},
            timeout=min(settings.location_provider_timeout_seconds, 10.0),
        )
        resp.raise_for_status()
        address = (resp.json() or {}).get("address") or {}
    except (httpx.HTTPError, ValueError):
        return None
    state = address.get("state") or address.get("province") or address.get("region")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"state": state, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}), encoding="utf-8")
    except OSError:
        pass
    return state
