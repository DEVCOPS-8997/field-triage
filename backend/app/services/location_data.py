"""Independent, cached point samples for the location-analysis data providers.

- ISRIC SoilGrids v2.0 (250 m modelled soil): clay, sand, organic carbon, pH for 0-30 cm.
  SoilGrids masks built-up land and water as null; if the exact point is masked, the nearest valid
  pixel within ~300 m (4 compass offsets) is used and the offset is reported.
- Copernicus DEM GLO-30 (public AWS COGs, no credentials): elevation and slope. GLO-30 is a surface
  model (it includes buildings and tree canopy), so a 3x3 pixel gradient mostly measures surface
  clutter. Slope is therefore the least-squares plane fitted over an 11x11 window (~330 m), which
  is the scale that matters for field run-off and erosion.
"""

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
SOIL_UNITS = {"soil_clay_pct": "%", "soil_sand_pct": "%", "soil_soc_g_kg": "g/kg", "soil_ph": "pH"}
SOIL_NEIGHBOUR_M = 300.0
SLOPE_WINDOW_HALF = 5  # 11 x 11 pixels at 1 arc-second (~30 m) = ~330 m
POSITIVE_TTL_S = {"soil": 30 * 86400, "terrain": 30 * 86400}
NEGATIVE_TTL_S = 6 * 3600  # "no soil here" (mask) answers are retried after 6 h
TRANSIENT_TTL_S = 10 * 60  # timeouts / throttling are retried after 10 min (keeps slider re-scoring fast)
SOIL_TIMEOUT_S = 12.0  # ISRIC normally answers in 3-6 s


def _cache_path(settings: Settings, source: str, lat: float, lon: float) -> Path:
    return settings.location_data_cache_dir / f"{source}_{lat:.5f}_{lon:.5f}.json"


def _cached(settings: Settings, source: str, lat: float, lon: float) -> dict[str, Any] | None:
    path = _cache_path(settings, source, lat, lon)
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
        stamp = obj.get("retrieved_at") or obj.get("checked_at")
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(stamp)).total_seconds()
        ttl = (
            POSITIVE_TTL_S.get(source, 3 * 86400) if obj.get("status") == "available"
            else TRANSIENT_TTL_S if obj.get("transient") else NEGATIVE_TTL_S
        )
        return obj if age <= ttl else None
    except (OSError, ValueError, KeyError, TypeError):
        return None


def is_cached(settings: Settings, lat: float, lon: float) -> bool:
    """True when both soil and terrain can be served without any provider call."""
    return all(_cached(settings, s, lat, lon) is not None for s in ("soil", "terrain"))


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


def _soilgrids_point(settings: Settings, lat: float, lon: float) -> dict[str, float | None]:
    """One SoilGrids query: 0-30 cm depth-weighted means converted to contract units (None if masked)."""
    params = [("lon", lon), ("lat", lat)] + [("property", p) for p in ("clay", "sand", "soc", "phh2o")] + [
        ("depth", d) for d in ("0-5cm", "5-15cm", "15-30cm")
    ] + [("value", "mean")]
    response = None
    for attempt in range(2):  # ISRIC throttles bursts (fair use ~5 calls/min): one backoff retry
        try:
            response = httpx.get(
                SOILGRIDS, params=params, timeout=min(settings.location_provider_timeout_seconds, SOIL_TIMEOUT_S)
            )
        except httpx.TimeoutException:
            if attempt == 1:
                raise
            time.sleep(2.0)
            continue
        if response.status_code in (429, 500, 502, 503, 504) and attempt == 0:
            time.sleep(min(10.0, float(response.headers.get("retry-after", 3) or 3)))
            continue
        break
    assert response is not None
    response.raise_for_status()
    layers = response.json().get("properties", {}).get("layers", [])
    if not layers:
        raise ValueError("SoilGrids response has no property layers")
    out: dict[str, float | None] = {k: None for k in SOIL_UNITS}
    names = {"clay": "soil_clay_pct", "sand": "soil_sand_pct", "soc": "soil_soc_g_kg", "phh2o": "soil_ph"}
    for layer in layers:
        target = names.get(layer.get("name"))
        if not target:
            continue
        points = []
        for depth in layer.get("depths", []):
            value = _num(depth.get("values", {}).get("mean"))
            if value is not None:
                interval = depth.get("range", depth.get("depth", {}))
                points.append((interval.get("top_depth", 0), interval.get("bottom_depth", 0), value))
        if points:
            # SoilGrids mapped units: clay/sand g/kg, soc dg/kg, pH x10; d_factor converts to %, g/kg, pH.
            avg = sum(v * (b - a) for a, b, v in points) / sum(b - a for a, b, _ in points)
            avg /= max(1, int(layer.get("unit_measure", {}).get("d_factor", 10)))
            out[target] = round(avg, 3)
    return out


def _soil(settings: Settings, lat: float, lon: float) -> dict[str, Any]:
    cached = _cached(settings, "soil", lat, lon)
    if cached:
        cached["cache"] = "hit"
        return cached
    dlat = SOIL_NEIGHBOUR_M / 110574.0
    dlon = SOIL_NEIGHBOUR_M / (111320.0 * max(0.05, math.cos(math.radians(lat))))
    candidates = [(lat, lon, 0.0, "point")] + [
        (lat + dlat, lon, SOIL_NEIGHBOUR_M, "north"), (lat, lon + dlon, SOIL_NEIGHBOUR_M, "east"),
        (lat - dlat, lon, SOIL_NEIGHBOUR_M, "south"), (lat, lon - dlon, SOIL_NEIGHBOUR_M, "west"),
    ]
    try:
        for clat, clon, offset, label in candidates:
            values = _soilgrids_point(settings, clat, clon)
            if any(v is not None for v in values.values()):
                note = (
                    "exact point" if offset == 0 else
                    f"exact point is masked by SoilGrids (built-up land or water); nearest valid pixel ~{offset:.0f} m {label} used"
                )
                result = {
                    "status": "available", "provider": "ISRIC SoilGrids v2.0", "product": "SoilGrids properties mean, 0-30 cm",
                    "values": values, "value": values, "unit": dict(SOIL_UNITS),
                    "spatial_resolution": "250 m", "observation_period": "static gridded model prediction",
                    "quality": "modelled; not laboratory measured", "sampled_at": {"lat": round(clat, 5), "lon": round(clon, 5)},
                    "sample_offset_m": offset, "sample_note": note,
                    "retrieved_at": datetime.now(timezone.utc).isoformat(), "cache": "miss",
                }
                _store(settings, "soil", lat, lon, result)
                return result
        out = _unavailable(
            "ISRIC SoilGrids v2.0",
            f"SoilGrids has no soil prediction at this point or within ~{SOIL_NEIGHBOUR_M:.0f} m (built-up land or water mask)",
            product="SoilGrids properties", resolution="250 m", unit=dict(SOIL_UNITS), quality="modelled data unavailable",
        )
        _store(settings, "soil", lat, lon, out)
        return out
    except (httpx.HTTPError, OSError, ValueError, KeyError, TypeError) as exc:
        out = _unavailable(
            "ISRIC SoilGrids v2.0", f"SoilGrids service did not respond ({type(exc).__name__}); retried automatically in about 10 minutes",
            product="SoilGrids properties", resolution="250 m", unit=dict(SOIL_UNITS), quality="modelled data unavailable",
        )
        out["transient"] = True
        _store(settings, "soil", lat, lon, out)
        return out


def plane_fit_slope_deg(z: np.ndarray, dx_m: float, dy_m: float) -> float | None:
    """Slope (degrees) of the least-squares plane through a masked elevation window."""
    rows, cols = z.shape
    yy, xx = np.mgrid[0:rows, 0:cols]
    mask = ~np.ma.getmaskarray(z)
    vals = np.ma.getdata(z).astype("float64")
    mask &= np.isfinite(vals)
    if mask.sum() < max(6, int(0.5 * rows * cols)):
        return None
    a = np.c_[xx[mask] * dx_m, -yy[mask] * dy_m, np.ones(int(mask.sum()))]
    (gx, gy, _), *_ = np.linalg.lstsq(a, vals[mask], rcond=None)
    return math.degrees(math.atan(math.hypot(gx, gy)))


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
        h = SLOPE_WINDOW_HALF
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
            with rasterio.open(url) as ds:
                row, col = ds.index(dataset_lon, lat)
                # Boundless read: pixels beyond the tile edge come back masked instead of failing.
                z = ds.read(1, window=Window(col - h, row - h, 2 * h + 1, 2 * h + 1), masked=True, boundless=True)
                if ds.nodata is not None:
                    z = np.ma.masked_equal(z, ds.nodata)
                z = np.ma.masked_invalid(z.astype("float64"))
                center = z[h, h]
                if np.ma.is_masked(center) or not math.isfinite(float(center)):
                    raise ValueError("Copernicus DEM has no valid elevation for this point")
                dx_m = abs(ds.transform.a) * 111320.0 * math.cos(math.radians(lat))
                dy_m = abs(ds.transform.e) * 110574.0
                slope = plane_fit_slope_deg(z, dx_m, dy_m)
                if slope is None:
                    raise ValueError("too few valid DEM pixels around the point to derive slope")
                relief = float(z.max() - z.min())
        result = {
            "status": "available", "provider": "Copernicus DEM GLO-30 (public AWS S3)", "product": "Copernicus DEM GLO-30",
            "value": {"elevation_m": round(float(center), 2), "slope_deg": round(slope, 3)},
            "unit": {"elevation_m": "m", "slope_deg": "degree (plane fitted over ~330 m)"},
            "spatial_resolution": "30 m (slope over ~330 m)", "observation_period": "2021 global DEM release",
            "quality": "digital surface model (includes buildings/canopy); slope is a least-squares plane over 11x11 pixels",
            "local_relief_m": round(relief, 2),
            "retrieved_at": datetime.now(timezone.utc).isoformat(), "cache": "miss",
        }
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
