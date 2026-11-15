"""Address search for marking fields: GET /geocode?q=... (OpenStreetMap Nominatim, server-side).

Accounts and saved fields live in Supabase (Auth + Postgres with Row Level Security, see
`supabase/migrations`); this backend only proxies address lookups so the browser never calls
Nominatim directly and the 1 request/second usage policy is respected for all users.
"""

from __future__ import annotations

import threading
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.api import get_request_settings
from app.config import Settings

router = APIRouter(tags=["geocode"])

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim's usage policy asks for an identifying User-Agent and at most 1 request per second.
NOMINATIM_UA = "FieldTriage/1.0 (crop-rotation decision-support tool)"

_lock = threading.Lock()
_last = [0.0]
_cache: dict[str, list[dict[str, Any]]] = {}


@router.get("/geocode")
def geocode(
    q: str = Query(..., min_length=3, max_length=200),
    settings: Settings = Depends(get_request_settings),
) -> list[dict[str, Any]]:
    """Turn a typed address into map coordinates (up to 5 matches)."""
    key = q.strip().lower()
    if key in _cache:
        return _cache[key]
    with _lock:
        wait = 1.0 - (time.monotonic() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()
    try:
        resp = httpx.get(
            NOMINATIM_URL,
            params={"q": q, "format": "jsonv2", "limit": 5},
            headers={"User-Agent": NOMINATIM_UA, "Accept-Language": "en"},
            timeout=settings.location_provider_timeout_seconds,
        )
        resp.raise_for_status()
        rows = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Address search is not responding. Try again or place the pin on the map.") from exc
    out = [
        {"label": r.get("display_name", ""), "lat": float(r["lat"]), "lon": float(r["lon"])}
        for r in rows
        if "lat" in r and "lon" in r
    ]
    if len(_cache) > 500:
        _cache.clear()
    _cache[key] = out
    return out
