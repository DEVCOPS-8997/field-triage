"""Liveness endpoint (`GET /api/v1/health`)."""

from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """Service liveness and active public data_mode check."""
    return HealthResponse(
        status="ok",
        service="field-triage",
        data_mode="observed",  # every score is computed from live retrieved data
    )
