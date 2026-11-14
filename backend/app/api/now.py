"""Optional Tier 3 30-day condition card endpoint (`GET /api/v1/fields/{id}/now`)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api import get_data_loader, get_request_settings
from app.config import Settings
from app.models.schemas import NowResponse
from app.services.data_loader import DataLoader
from app.services.power_live import fetch_and_evaluate_now
from app.utils.validation import ProfileUnavailableError

router = APIRouter(prefix="/fields", tags=["now"])


@router.get("/{field_id}/now", response_model=NowResponse)
def get_field_now(
    field_id: str,
    loader: DataLoader = Depends(get_data_loader),
    settings: Settings = Depends(get_request_settings),
) -> NowResponse:
    """Return optional Tier 3 30-day live NASA POWER status (`FAVORABLE` | `WATCH` | `STRESSED`)."""
    catalog = loader.load_catalog()
    field = loader.get_field(field_id)

    local_profile = None
    try:
        local_profile = loader.load_field_profile(field.field_id)
    except ProfileUnavailableError:
        local_profile = None

    return fetch_and_evaluate_now(
        field=field,
        parameters=catalog.parameters,
        settings=settings,
        local_profile=local_profile,
    )
