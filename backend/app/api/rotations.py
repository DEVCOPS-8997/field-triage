"""Rotation catalog endpoint (`GET /rotations`). Scoring runs only on live data via /locations/compare."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from app.api import get_data_loader
from app.services.data_loader import DataLoader

router = APIRouter(prefix="/rotations", tags=["rotations"])


@router.get("", response_model=list[dict[str, Any]])
def list_rotations(
    region_id: Optional[str] = Query(default=None, description="Optional region_id filter"),
    loader: DataLoader = Depends(get_data_loader),
) -> list[dict[str, Any]]:
    """Return the rotation strategy library (`data/rotations.json`), optionally filtered by region."""
    return loader.list_rotations(region_id=region_id)
