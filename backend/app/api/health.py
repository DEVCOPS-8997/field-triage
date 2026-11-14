"""Liveness endpoint (`GET /api/v1/health`)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api import get_request_settings
from app.config import Settings
from app.models.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def get_health(settings: Settings = Depends(get_request_settings)) -> HealthResponse:
    """Service liveness and active public data_mode check."""
    return HealthResponse(
        status="ok",
        service="field-shift-advisor",
        data_mode=settings.public_data_mode,
    )
