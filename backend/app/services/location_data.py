"""Independent, cached point samples for the location-analysis data providers."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import time
from typing import Any

import httpx
import numpy as np

from app.config import Settings

SOILGRIDS = "https://rest.isric.org/soilgrids/v2.0/properties/query"
def _cache_path(settings: Settings, source: str, lat: float, lon: float) -> Path:
    return settings.location_data_cache_dir / f"{source}_{lat:.5f}_{lon:.5f}.json"


def _cached(settings: Settings, source: str, lat: float, lon: float) -> dict[str, Any] | None:
    path = _cache_path(settings, source, lat, lon)
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(obj["retrieved_at"])).total_seconds()
        return obj if age <= (30 * 86400 if source in ("soil", "terrain") else 3 * 86400) else None
    except (OSError, ValueError, KeyError):
        return None


def _store(settings: Settings, source: str, lat: float, lon: float, value: dict[str, Any]) -> None:
    path = _cache_path(settings, source, lat, lon)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix(f".{os.getpid()}.{time.time_ns()}.tmp")
        temp.write_text(json.dumps(value, allow_nan=False), encoding="utf-8")
        os.replace(temp, path)
    except OSError:
        # Valid retrieved data remains usable even if this process cannot write its cache.
        return


def _unavailable(provider: str, reason: str, *, product: str | None = None, resolution: str | None = None,
                 unit: str | dict[str, str] | None = None, quality: str = "unavailable") -> dict[str, Any]:
    out: dict[str, Any] = {
        "status": "unavailable", "provider": provider, "reason": reason, "value": None,
        "retrieved_at": None, "checked_at": datetime.now(timezone.utc).isoformat(), "observation_period": None,
        "quality": quality,
    }
    if product:
        out["product"] = product
    if resolution:
        out["spatial_resolution"] = resolution
    if unit:
        out["unit"] = unit
    return out


def _num(value: Any) -> float | None:
    try:
        v = float(value)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def _soil(settings: Settings, lat: float, lon: float) -> dict[str, Any]:
    cached = _cached(settings, "soil", lat, lon)
    if cached:
        cached["cache"] = "hit"
        return cached
    params = [("lon", lon), ("lat", lat)] + [("property", p) for p in ("clay", "sand", "soc", "phh2o")] + [("depth", d) for d in ("0-5cm", "5-15cm", "15-30cm")] + [("value", "mean")]
    try:
        response = httpx.get(SOILGRIDS, params=params, timeout=settings.location_provider_timeout_seconds)
        response.raise_for_status()
        payload = response.json()
        properties = payload.get("properties", {}).get("layers", [])
        if not properties:
            raise ValueError("SoilGrids response has no property layers")
        out: dict[str, float | None] = {"soil_clay_pct": None, "soil_sand_pct": None, "soil_soc_g_kg": None, "soil_ph": None}
        names = {"clay": "soil_clay_pct", "sand": "soil_sand_pct", "soc": "soil_soc_g_kg", "phh2o": "soil_ph"}
        for layer in properties:
            target = names.get(layer.get("name"))
            if not target:
                continue
            points = []
            for depth in layer.get("depths", []):
                vals = depth.get("values", {})
                value = _num(vals.get("mean"))
                if value is not None:
                    interval = depth.get("range", depth.get("depth", {}))
                    points.append((interval.get("top_depth", 0), interval.get("bottom_depth", 0), value))
            if points:
                # 0-30 cm depth-weighted average; convert SoilGrids native units to profile contract units.
                avg = sum(v * (b - a) for a, b, v in points) / sum(b - a for a, b, _ in points)
                avg /= max(1, int(layer.get("unit_measure", {}).get("d_factor", 10)))
                out[target] = round(avg, 3)
        if all(v is None for v in out.values()):
            raise ValueError("SoilGrids contained no valid mean values")
        result = {"status": "available", "provider": "ISRIC SoilGrids v2.0", "product": "SoilGrids properties mean, 0-30 cm", "values": out, "value": out,
                  "unit": {"soil_clay_pct": "%", "soil_sand_pct": "%", "soil_soc_g_kg": "g/kg", "soil_ph": "pH"},
                  "spatial_resolution": "250 m", "observation_period": "static gridded model prediction", "quality": "modelled; not laboratory measured",
                  "retrieved_at": datetime.now(timezone.utc).isoformat(), "cache": "miss"}
        _store(settings, "soil", lat, lon, result)
        return result
    except (httpx.HTTPError, OSError, ValueError, KeyError, TypeError) as exc:
        return _unavailable(
            "ISRIC SoilGrids v2.0", f"{type(exc).__name__}: {exc}", product="SoilGrids properties",
            resolution="250 m", unit={"soil_clay_pct": "%", "soil_sand_pct": "%", "soil_soc_g_kg": "g/kg", "soil_ph": "pH"},
            quality="modelled data unavailable",
        )


def _terrain(settings: Settings, lat: float, lon: float) -> dict[str, Any]:
    cached = _cached(settings, "terrain", lat, lon)
    if cached:
        cached["cache"] = "hit"
        return cached
    try:
        import rasterio
        from rasterio.windows import Window
        # AWS public GLO-30 COG naming: 1x1 degree tile; no AWS credentials are used.
        south = math.floor(lat)
        dataset_lon = ((lon + 180.0) % 360.0) - 180.0
        west = math.floor(dataset_lon)
        ns = "N" if south >= 0 else "S"
        ew = "E" if west >= 0 else "W"
        key = f"Copernicus_DSM_COG_10_{ns}{abs(south):02d}_00_{ew}{abs(west):03d}_00_DEM"
        url = f"https://copernicus-dem-30m.s3.amazonaws.com/{key}/{key}.tif"
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
            with rasterio.open(url) as ds:
                row, col = ds.index(dataset_lon, lat)
                if row < 1 or col < 1 or row >= ds.height - 1 or col >= ds.width - 1:
                    raise ValueError("coordinate is outside the available DEM tile interior")
                values = ds.read(1, window=Window(col - 1, row - 1, 3, 3), masked=True).astype("float64")
                mask = np.ma.getmaskarray(values)
                center = float(values[1, 1])
                if mask[1, 1] or not math.isfinite(center):
                    raise ValueError("Copernicus DEM has no valid elevation for this point")
                if mask[0, 1] or mask[2, 1] or mask[1, 0] or mask[1, 2]:
                    raise ValueError("Copernicus DEM has missing neighboring pixels required for slope")
                # Central difference using local pixel scale, accounting for latitude.
                x_m = abs(ds.transform.a) * 111320 * math.cos(math.radians(lat))
                y_m = abs(ds.transform.e) * 110574
                gx = (float(values[1, 2]) - float(values[1, 0])) / (2 * x_m)
                gy = (float(values[2, 1]) - float(values[0, 1])) / (2 * y_m)
                slope = math.degrees(math.atan(math.hypot(gx, gy)))
        result = {"status": "available", "provider": "Copernicus DEM GLO-30 (public AWS S3)", "product": "Copernicus DEM GLO-30", "value": {"elevation_m": round(center, 2), "slope_deg": round(slope, 3)},
                  "unit": {"elevation_m": "m", "slope_deg": "degree (derived from neighboring DEM cells)"}, "spatial_resolution": "30 m", "observation_period": "2021 global DEM release",
                  "quality": "elevation sampled from 3x3 neighborhood; slope is derived", "retrieved_at": datetime.now(timezone.utc).isoformat(), "cache": "miss"}
        _store(settings, "terrain", lat, lon, result)
        return result
    except (ImportError, OSError, ValueError, httpx.HTTPError) as exc:
        reason = "rasterio is not installed" if isinstance(exc, ImportError) else f"{type(exc).__name__}: {exc}"
        return _unavailable(
            "Copernicus DEM GLO-30 public AWS S3", reason, product="Copernicus DEM GLO-30",
            resolution="30 m", unit={"elevation_m": "m", "slope_deg": "degree (derived)"},
            quality="terrain data unavailable",
        )


def get_location_data(settings: Settings, lat: float, lon: float) -> dict[str, dict[str, Any]]:
    """Fetch supported global providers independently; failures never abort location analysis."""
    results: dict[str, dict[str, Any]] = {}
    for key, fetch, provider, product, resolution in (
        ("soil", _soil, "ISRIC SoilGrids v2.0", "SoilGrids properties", "250 m"),
        ("terrain", _terrain, "Copernicus DEM GLO-30 public AWS S3", "Copernicus DEM GLO-30", "30 m"),
    ):
        try:
            results[key] = fetch(settings, lat, lon)
        except Exception as exc:  # Provider boundary: one source must not abort the other.
            results[key] = _unavailable(provider, f"{type(exc).__name__}: {exc}", product=product, resolution=resolution)
    return results
