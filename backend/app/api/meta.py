"""NASA and contextual dataset provenance metadata endpoint (`GET /api/v1/meta/sources`)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app.api import get_data_loader
from app.services.data_loader import DataLoader

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/sources", response_model=list[dict[str, Any]])
def list_meta_sources(loader: DataLoader = Depends(get_data_loader)) -> list[dict[str, Any]]:
    """Return M3's dataset metadata catalog (`data/nasa_metadata.json`)."""
    return loader.list_nasa_metadata()
