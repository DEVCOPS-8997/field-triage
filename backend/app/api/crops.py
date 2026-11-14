"""Crop library endpoint (`GET /api/v1/crops`)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.api import get_data_loader
from app.services.data_loader import DataLoader

router = APIRouter(prefix="/crops", tags=["crops"])


@router.get("", response_model=list[dict[str, Any]])
def list_crops(loader: DataLoader = Depends(get_data_loader)) -> list[dict[str, Any]]:
    """Return M3's crop library (`data/crops.json`)."""
    return loader.list_crops()
