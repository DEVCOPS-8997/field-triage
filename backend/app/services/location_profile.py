"""Coordinates -> supported crop region -> live data -> temporary FieldProfile + FieldInfo.

Nothing here is persisted as a field. NASA POWER (rain, temperature, humidity, wind, radiation,
MERRA-2 root-zone wetness), ISRIC SoilGrids and Copernicus DEM are retrieved live and cached.
Reference ET (FAO-56) and soil water-holding capacity (Saxton-Rawls) are derived from them.
SMAP and MODIS are not retrieved in this workflow (they need Earth Engine/Earthdata credentials).
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any

from app.config import Settings
from app.models.schemas import FieldInfo, FieldProfile, Location
from app.services.agromet import daily_eto, organic_matter_pct, saxton_rawls_awc, usda_texture_class
from app.services.m1_profile import profile_from_daily
from app.services.power_history import PowerHistory, get_power_history
from app.services.location_data import get_location_data
from app.utils.validation import DatasetIntegrityError, RequestValidationError, is_valid_number


def load_regions(settings: Settings) -> list[dict[str, Any]]:
    path = settings.data_dir / "regions.json"
    try:
        regions = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(regions, list):
            raise ValueError("expected a JSON array")
        return regions
    except (OSError, ValueError) as exc:
        raise DatasetIntegrityError(f"regions.json missing or invalid at '{path}': {exc}") from exc


def resolve_region(lat: float, lon: float, settings: Settings) -> dict[str, Any]:
    """Return the supported region containing the point, or raise (never fall back to a nearest one)."""
    regions = load_regions(settings)
    for r in regions:
        b = r["bbox"]
        if b["lat_min"] <= lat <= b["lat_max"] and b["lon_min"] <= lon <= b["lon_max"]:
            return r
    names = ", ".join(r["name"] for r in regions)
    raise RequestValidationError(
        f"Location ({lat:.4f}, {lon:.4f}) is outside the supported regions ({names}). "
        "No crop calendars exist for this area, so no recommendation can be made."
    )


def map_current_rotation(
    *,
    region_id: str,
    rotations: list[dict[str, Any]],
    current_rotation_id: str | None,
    current_crop: str | None,
) -> str:
    """Resolve the farmer's current rotation. A crop maps only if exactly one regional rotation has it."""
    regional = [r for r in rotations if r.get("region_id") == region_id]
    by_id = {r["rotation_id"]: r for r in regional}
    if current_rotation_id:
        if current_rotation_id not in by_id:
            raise RequestValidationError(
                f"current_rotation_id '{current_rotation_id}' is not a rotation in region '{region_id}'. "
                f"Valid: {sorted(by_id)}."
            )
        return current_rotation_id
    if not current_crop:
        raise RequestValidationError(
            "Provide current_rotation_id or current_crop so the current rotation can be compared."
        )
    crop = current_crop.strip().lower()
    matches = [r["rotation_id"] for r in regional if crop in [c.lower() for c in r.get("sequence", [])]]
    if len(matches) == 1:
        return matches[0]
    if not matches:
        raise RequestValidationError(
            f"Crop '{current_crop}' is not part of any rotation in region '{region_id}'."
        )
    raise RequestValidationError(
        f"Crop '{current_crop}' appears in several rotations {matches}; "
        "choose one with current_rotation_id."
    )


@dataclass(frozen=True)
class LocationAnalysisInput:
    field: FieldInfo
    raw_field_meta: dict[str, Any]
    profile: FieldProfile
    history: PowerHistory
    region: dict[str, Any]
    location_data: dict[str, dict[str, Any]]


def build_location_inputs(
    *,
    lat: float,
    lon: float,
    irrigation: str,
    current_rotation_id: str | None,
    current_crop: str | None,
    rotations: list[dict[str, Any]],
    settings: Settings,
) -> LocationAnalysisInput:
    region = resolve_region(lat, lon, settings)
    rot_id = map_current_rotation(
        region_id=region["region_id"], rotations=rotations,
        current_rotation_id=current_rotation_id, current_crop=current_crop,
    )
    field_id = f"LOC_{lat:.4f}_{lon:.4f}"
    # Point data first: DEM elevation feeds the FAO-56 pressure term, SoilGrids feeds soil water.
    location_data = get_location_data(settings, lat, lon)
    soil_values = dict(location_data["soil"].get("values") or {})
    terrain_values = location_data["terrain"].get("value")
    terrain_values = terrain_values if isinstance(terrain_values, dict) else {}

    soil_derived: dict[str, float | None] = {}
    texture: str | None = None
    sand, clay = soil_values.get("soil_sand_pct"), soil_values.get("soil_clay_pct")
    if is_valid_number(sand) and is_valid_number(clay):
        om = organic_matter_pct(soil_values.get("soil_soc_g_kg"))
        sr = saxton_rawls_awc(float(sand), float(clay), om if om is not None else 1.0)
        soil_derived = {
            "soil_silt_pct": round(100.0 - float(sand) - float(clay), 2),
            "soil_om_pct": None if om is None else round(om, 2),
            "soil_field_capacity_m3m3": round(sr["field_capacity_m3m3"], 3),
            "soil_wilting_point_m3m3": round(sr["wilting_point_m3m3"], 3),
            "soil_awc_m3m3": round(sr["awc_m3m3"], 3),
        }
        texture = usda_texture_class(float(sand), float(clay))

    field = FieldInfo(
        field_id=field_id,
        name=f"GPS location {lat:.4f}, {lon:.4f}",
        region_id=region["region_id"],
        location=Location(lat=lat, lon=lon),
        soil_type=texture,
        irrigation=irrigation,  # type: ignore[arg-type]
        market_access=None,
        current_rotation_id=rot_id,
        geometry={"type": "Point", "coordinates": [lon, lat]},
    )
    history = get_power_history(lat, lon, settings)
    cell = history.cell
    elevation = terrain_values.get("elevation_m")
    if not is_valid_number(elevation):
        elevation = history.elevation_m
    daily = history.df.join(daily_eto(history.df, lat=lat, elevation_m=elevation))
    df = daily.rename_axis("date").reset_index()
    profile = profile_from_daily(
        field_id,
        df,
        label=f"NASA POWER history for {field_id}",
        power_source=(
            f"NASA POWER daily (gridded ~0.5 degree data, not field sensors), cell centred at "
            f"{cell['center_lat']}, {cell['center_lon']}; {history.start} to {history.end}; "
            f"fetched {history.fetched_at} ({history.source})"
        ),
    )
    for key in ("soil", "terrain"):
        available = location_data[key].get("status") == "available"
        profile.data_quality[key] = "derived" if available else "unavailable"
        if available:
            note = location_data[key].get("sample_note")
            profile.data_sources[key] = (
                f"{location_data[key].get('provider')} — {location_data[key].get('product')}"
                + (f" ({note})" if note and note != "exact point" else "")
            )
        else:
            profile.data_sources[key] = f"Unavailable: {location_data[key].get('reason', 'no valid data')}"
    if soil_values:
        profile.soil.update(soil_values)
        profile.soil.update(soil_derived)
    if terrain_values:
        profile.terrain.update(terrain_values)
    return LocationAnalysisInput(
        field=field,
        raw_field_meta={"source": "farmer_input_gps", "boundary_source": "gps_point"},
        profile=profile,
        history=history,
        region=region,
        location_data=location_data,
    )
