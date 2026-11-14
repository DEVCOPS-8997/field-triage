"""Dynamic GPS-based comparison (`POST /locations/compare`)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api import get_data_loader, get_request_settings
from app.config import Settings
from app.models.schemas import LocationCompareRequest, LocationCompareResponse, LocationDataResponse, LocationInfo, Location
from app.services.data_loader import DataLoader
from app.services.explain import build_compare_response
from app.services.location_profile import build_location_inputs
from app.services.location_data import get_location_data
from app.services.rate_limit import location_rate_limit
from app.services.rotation_engine import evaluate_rotations

router = APIRouter(prefix="/locations", tags=["locations"])

RESOLUTION_NOTE = (
    "NASA POWER climate represents a roughly 0.5-degree grid cell. SoilGrids is a modelled 250 m estimate "
    "and Copernicus DEM is 30 m. These are grid estimates, not field sensor or laboratory measurements; "
    "the climate cell is not this exact field. SMAP and MODIS are not retrieved by this analysis."
)
ANALYSIS_TYPE = "historical_rotation_suitability"


@router.get("/data", response_model=LocationDataResponse, dependencies=[Depends(location_rate_limit)])
def location_data(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    settings: Settings = Depends(get_request_settings),
) -> LocationDataResponse:
    """Return global SoilGrids/DEM point data without requiring a supported crop region."""
    return LocationDataResponse(location=Location(lat=lat, lon=lon), providers=get_location_data(settings, lat, lon))


@router.post("/compare", response_model=LocationCompareResponse, dependencies=[Depends(location_rate_limit)])
def compare_location(
    payload: LocationCompareRequest,
    loader: DataLoader = Depends(get_data_loader),
    settings: Settings = Depends(get_request_settings),
) -> LocationCompareResponse:
    """Rank rotations for a GPS point using the existing deterministic engine on a temporary profile."""
    catalog = loader.load_catalog()
    inp = build_location_inputs(
        lat=payload.location.lat,
        lon=payload.location.lon,
        irrigation=payload.irrigation,
        current_rotation_id=payload.current_rotation_id,
        current_crop=payload.current_crop,
        rotations=catalog.rotations,
        settings=settings,
    )
    engine_result = evaluate_rotations(
        field=inp.field,
        profile=inp.profile,
        crops_by_id=catalog.crops_by_id,
        rotations=catalog.rotations,
        parameters=catalog.parameters,
        priorities=payload.priorities,
        scenario=payload.scenario,
        requested_rotation_ids=payload.rotation_ids,
    )
    base = build_compare_response(
        engine_result=engine_result,
        field=inp.field,
        raw_field_meta=inp.raw_field_meta,
        profile=inp.profile,
        parameters=catalog.parameters,
        nasa_metadata_by_id=catalog.nasa_metadata_by_id,
        scenario=payload.scenario,
    )

    q = inp.profile.data_quality
    warnings = [
        f"Whole-rotation suitability from historical climate (about {inp.profile.n_years} complete years). "
        "This is not a forecast for the coming season.",
        "Irrigation and current rotation are farmer-reported and unverified.",
    ]
    for key, label in (("smap", "SMAP soil moisture"), ("modis", "MODIS vegetation")):
        if q.get(key) == "unavailable":
            warnings.append(f"{label} not retrieved by this analysis; it is not used in the scores.")
    for key, label in (("soil", "SoilGrids soil properties"), ("terrain", "Copernicus terrain")):
        if q.get(key) == "unavailable":
            reason = inp.location_data[key].get("reason", "no valid observations")
            warnings.append(f"{label} unavailable ({reason}); it is not used in the scores.")
    warnings.append(
        "The soil score reflects crop traits in the crop catalog (residue, nitrogen fixation, pest break), "
        "not measured soil at this location."
    )
    if inp.history.warning:
        warnings.append(inp.history.warning)

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
        ),
        analysis_type=ANALYSIS_TYPE,
        warnings=warnings,
        data_retrieval={
            "source": inp.history.source,
            "fetched_at": inp.history.fetched_at,
            "period_start": inp.history.start,
            "period_end": inp.history.end,
            "stale": inp.history.source == "stale_cache",
            "geospatial": inp.location_data,
            "field_profile": {
                "soil": inp.profile.soil,
                "terrain": inp.profile.terrain,
                "data_sources": inp.profile.data_sources,
                "data_quality": inp.profile.data_quality,
            },
        },
    )
