"""Field catalog and per-field profile endpoints (`GET /fields`, `GET /fields/{id}/profile`)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api import get_data_loader
from app.models.schemas import FieldInfo, FieldProfile
from app.services.data_loader import DataLoader

router = APIRouter(prefix="/fields", tags=["fields"])


@router.get("", response_model=list[FieldInfo])
def list_fields(loader: DataLoader = Depends(get_data_loader)) -> list[FieldInfo]:
    """Return all configured pilot fields from `data/fields.json`."""
    return loader.list_fields()


@router.get("/{field_id}/profile", response_model=FieldProfile)
def get_field_profile(
    field_id: str,
    loader: DataLoader = Depends(get_data_loader),
) -> FieldProfile:
    """Return validated `FieldProfile` for `field_id` in active `DATA_MODE`."""
    return loader.load_field_profile(field_id)
