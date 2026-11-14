"""Rotation catalog and primary crop-rotation comparison endpoints."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from app.api import get_data_loader
from app.models.schemas import CompareRequest, CompareResponse
from app.services.data_loader import DataLoader
from app.services.explain import build_compare_response
from app.services.rotation_engine import evaluate_rotations

router = APIRouter(prefix="/rotations", tags=["rotations"])


@router.get("", response_model=list[dict[str, Any]])
def list_rotations(
    region_id: Optional[str] = Query(default=None, description="Optional region_id filter"),
    loader: DataLoader = Depends(get_data_loader),
) -> list[dict[str, Any]]:
    """Return M3's rotation strategy library (`data/rotations.json`), optionally filtered by region."""
    return loader.list_rotations(region_id=region_id)


@router.post("/compare", response_model=CompareResponse)
def compare_rotations(
    payload: CompareRequest,
    loader: DataLoader = Depends(get_data_loader),
) -> CompareResponse:
    """Evaluate, rank, and explain >= 3 crop rotations (including existing) for `payload.field_id`."""
    catalog = loader.load_catalog()
    field = loader.get_field(payload.field_id)
    raw_field_meta = loader.get_field_raw_metadata(field.field_id)
    profile = loader.load_field_profile(field.field_id)

    engine_result = evaluate_rotations(
        field=field,
        profile=profile,
        crops_by_id=catalog.crops_by_id,
        rotations=catalog.rotations,
        parameters=catalog.parameters,
        priorities=payload.priorities,
        scenario=payload.scenario,
        requested_rotation_ids=payload.rotation_ids,
    )

    return build_compare_response(
        engine_result=engine_result,
        field=field,
        raw_field_meta=raw_field_meta,
        profile=profile,
        parameters=catalog.parameters,
        nasa_metadata_by_id=catalog.nasa_metadata_by_id,
        scenario=payload.scenario,
    )
