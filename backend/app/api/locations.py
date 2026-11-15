"""Live GPS-based analysis (`POST /locations/compare`, `GET /locations/data`, `GET /regions`)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from app.api import get_data_loader, get_request_settings
from app.config import Settings
from app.models.schemas import (
    LocationCompareRequest,
    LocationCompareResponse,
    LocationDataResponse,
    LocationInfo,
    Location,
    RegionInfo,
)
from app.services import location_data as location_data_service
from app.services import modis_ndvi
from app.services import power_history
from app.services.data_loader import DataLoader
from app.services.explain import build_compare_response
from app.services.location_profile import (
    build_location_inputs,
    current_rotation_note,
    load_regions,
    resolve_region,
)
from app.services.power_live import classify_now_conditions
from app.services.rate_limit import location_rate_limit
from app.services.rotation_engine import evaluate_rotations

router = APIRouter(prefix="/locations", tags=["locations"])
regions_router = APIRouter(tags=["locations"])

RESOLUTION_NOTE = (
    "NASA POWER climate represents a roughly 0.5-degree grid cell (MERRA-2 meteorology, CERES radiation). "
    "SoilGrids is a modelled 250 m estimate and Copernicus DEM is a 30 m surface model. These are grid "
    "estimates, not field sensor or laboratory measurements; the climate cell is not this exact field."
)
ANALYSIS_TYPE = "historical_rotation_suitability"


@regions_router.get("/regions", response_model=list[RegionInfo])
def list_regions(settings: Settings = Depends(get_request_settings)) -> list[RegionInfo]:
    """Regions that have crop calendars (approximate rectangles, not official borders)."""
    return [RegionInfo.model_validate(r) for r in load_regions(settings)]


@router.get("/data", response_model=LocationDataResponse, dependencies=[Depends(location_rate_limit)])
def location_data(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    settings: Settings = Depends(get_request_settings),
) -> LocationDataResponse:
    """Return global SoilGrids/DEM point data without requiring a supported crop region."""
    return LocationDataResponse(
        location=Location(lat=lat, lon=lon),
        providers=location_data_service.get_location_data(settings, lat, lon),
    )


@router.get("/ndvi")
def location_ndvi(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    start: bool = Query(True, description="Start a background fetch if nothing is cached yet"),
    settings: Settings = Depends(get_request_settings),
) -> dict:
    """MODIS NDVI status for a point: ready | running | failed | not_configured | disabled.

    When ready, the per-pixel summary (monthly NDVI, 12-month climatology, bare days, latest value)
    is included so the page can draw the greenness row without re-running the comparison.
    """
    st = modis_ndvi.status(settings, lat, lon, start=start)
    if st["state"] == "ready":
        st["summary"] = modis_ndvi.load_cached(settings, lat, lon)
    return st


@router.get("/region")
def location_region(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    loader: DataLoader = Depends(get_data_loader),
    settings: Settings = Depends(get_request_settings),
) -> dict:
    """Resolve the supported crop region for a point and list its rotations (422 if unsupported)."""
    region = resolve_region(lat, lon, settings)
    return {
        "region_id": region["region_id"],
        "region_name": region["name"],
        "rotations": loader.list_rotations(region_id=region["region_id"]),
    }


@router.post("/compare", response_model=LocationCompareResponse)
def compare_location(
    payload: LocationCompareRequest,
    request: Request,
    loader: DataLoader = Depends(get_data_loader),
    settings: Settings = Depends(get_request_settings),
) -> LocationCompareResponse:
    """Rank rotations for a GPS point from live NASA POWER, SoilGrids and Copernicus DEM data."""
    lat, lon = payload.location.lat, payload.location.lon
    # Only requests that must call an upstream provider count against the rate limit; re-scoring a
    # cached point (priority / scenario sliders) is local computation.
    if not (power_history.cache_is_current(lat, lon, settings) and location_data_service.is_cached(settings, lat, lon)):
        location_rate_limit(request)

    catalog = loader.load_catalog()
    inp = build_location_inputs(
        lat=lat,
        lon=lon,
        irrigation=payload.irrigation,
        current_rotation_id=payload.current_rotation_id,
        current_crop=payload.current_crop,
        rotations=catalog.rotations,
        settings=settings,
    )
    # MODIS NDVI: merge the cached per-pixel history if it exists, otherwise start fetching it in
    # the background (the page polls GET /locations/ndvi and re-runs compare when it is ready).
    bare_threshold = float(catalog.parameters.get("ndvi_bare_threshold", 0.2))
    ndvi_cached = modis_ndvi.load_cached(settings, lat, lon)
    if ndvi_cached:
        modis_ndvi.apply_to_profile(inp.profile, ndvi_cached)
    ndvi_status = modis_ndvi.status(settings, lat, lon, start=True, bare_threshold=bare_threshold)

    engine_result = evaluate_rotations(
        field=inp.field,
        profile=inp.profile,
        crops_by_id=catalog.crops_by_id,
        rotations=catalog.rotations,
        parameters=catalog.parameters,
        priorities=payload.priorities,
        scenario=payload.scenario,
        requested_rotation_ids=payload.rotation_ids,
        market_crops=catalog.market_crops(inp.region.get("country_iso3")),
        constraints=payload.constraints,
    )
    country_name = (
        ((catalog.market or {}).get("countries") or {}).get(inp.region.get("country_iso3") or "", {}).get("name")
    )
    base = build_compare_response(
        engine_result=engine_result,
        field=inp.field,
        raw_field_meta=inp.raw_field_meta,
        profile=inp.profile,
        parameters=catalog.parameters,
        nasa_metadata_by_id=catalog.nasa_metadata_by_id,
        scenario=payload.scenario,
        crops_by_id=catalog.crops_by_id,
        market=catalog.market,
        market_crops=catalog.market_crops(inp.region.get("country_iso3")),
        country_name=country_name,
        region_name=inp.region["name"],
    )
    # Only report sources this analysis actually used. SMAP is not fetched for GPS points; MODIS is
    # listed once its NDVI history has been merged.
    for key in ("smap", "modis"):
        if base.data_quality.get(key) == "unavailable":
            base.data_quality.pop(key, None)
    if ndvi_status["state"] in ("running", "not_started"):
        warnings_ndvi = "Satellite greenness (MODIS NDVI) for this spot is still downloading; bare-soil months use crop calendars until it is ready."
    elif ndvi_status["state"] in ("failed", "not_configured"):
        warnings_ndvi = "Satellite greenness (MODIS NDVI) could not be loaded for this spot, so bare-soil months come from crop calendars."
    else:
        warnings_ndvi = None
    if base.income_status and base.income_status.get("scored"):
        base.data_quality["faostat"] = "observed"

    q = inp.profile.data_quality
    clim = inp.profile.climatology
    warnings = [
        f"Scores replay the last {inp.profile.n_years} years of NASA weather for this spot. "
        "They show how each rotation would have done, not a forecast for next season.",
        "Your irrigation and current rotation come from the form and have not been checked.",
    ]
    for key, label in (("soil", "SoilGrids soil data"), ("terrain", "Copernicus elevation data")):
        if q.get(key) == "unavailable":
            reason = inp.location_data[key].get("reason", "no valid observations")
            warnings.append(f"{label} could not be loaded ({reason}), so it is left out of the scores.")
    soil_note = inp.location_data["soil"].get("sample_note")
    if soil_note and soil_note != "exact point":
        warnings.append(f"SoilGrids: {soil_note}.")
    share = clim.get("eto_penman_monteith_share")
    if isinstance(share, (int, float)) and share < 0.9:
        warnings.append(
            f"Reference ET used FAO-56 Penman-Monteith on {share:.0%} of days; the rest used the temperature-only "
            "Hargreaves method because POWER radiation or humidity was missing."
        )
    if inp.history.warning:
        warnings.append(inp.history.warning)
    note = current_rotation_note(
        region_id=inp.region["region_id"], rotations=catalog.rotations,
        current_crop=None if payload.current_rotation_id else payload.current_crop,
        chosen_id=inp.field.current_rotation_id,
    )
    if note:
        warnings.append(note)
    if warnings_ndvi:
        warnings.append(warnings_ndvi)
    if inp.region.get("resolved_by") == "file_order":
        warnings.append(
            f"This point is near a provincial border and the province could not be confirmed online; "
            f"{inp.region['name']} crop calendars are used. Tell us if your field is in another province."
        )

    # Current conditions: last 30 days of the same live POWER record (POWER publishes with ~5 days lag).
    now_metrics = dict(inp.profile.now)
    now_status, now_reasons = classify_now_conditions(
        now_metrics=now_metrics,
        now_thresholds=catalog.parameters.get("now", {}),
        irrigation=payload.irrigation,
    )
    wet = now_metrics.get("rootzone_wetness_latest")
    dry_wet = float(catalog.parameters.get("now", {}).get("rootzone_wetness_dry", 0.3))
    if isinstance(wet, (int, float)) and wet < dry_wet:
        now_reasons.append(
            f"POWER/MERRA-2 root-zone wetness is {wet:.2f} (below {dry_wet:.2f} on a 0-1 scale): soils are dry for this area."
        )
        if now_status == "FAVORABLE":
            now_status = "WATCH"

    return LocationCompareResponse(
        **base.model_dump(),
        location=LocationInfo(
            lat=inp.field.location.lat,
            lon=inp.field.location.lon,
            region_id=inp.region["region_id"],
            region_name=inp.region["name"],
            current_rotation_id=inp.field.current_rotation_id,
            nasa_grid_cell=inp.history.cell,
            data_resolution_note=RESOLUTION_NOTE,
            soil_texture_class=inp.field.soil_type,
        ),
        analysis_type=ANALYSIS_TYPE,
        warnings=warnings,
        data_retrieval={
            "source": inp.history.source,
            "fetched_at": inp.history.fetched_at,
            "period_start": inp.history.start,
            "period_end": inp.history.end,
            "stale": inp.history.source == "stale_cache",
            "power_parameters": list(power_history.POWER_PARAMETERS),
            "geospatial": inp.location_data,
            "ndvi": {**ndvi_status, "merged": bool(ndvi_cached)},
        },
        profile=inp.profile,
        now_status=now_status,
        now_reasons=now_reasons,
    )
