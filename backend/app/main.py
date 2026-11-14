"""FastAPI application entrypoint (`app/main.py`) for Field Shift Advisor."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import crops, geocode, health, locations, meta, rotations
from app.config import Settings, get_settings
from app.utils.validation import (
    DatasetIntegrityError,
    ProfileUnavailableError,
    RequestValidationError,
    UnknownFieldError,
)

logger = logging.getLogger("field_shift_advisor")


LOOPBACK_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


def create_app(settings: Settings | None = None) -> FastAPI:
    """Construct FastAPI application with CORS, `/api/v1` routers, and structured error handlers."""
    resolved_settings = settings or get_settings()

    application = FastAPI(
        title="Field Shift Advisor API",
        description=(
            "Deterministic multi-season crop-rotation decision-support engine powered by "
            "live NASA POWER, SoilGrids and Copernicus DEM data for any GPS point in a supported region."
        ),
        version="1.0.0",
    )
    application.state.settings_override = settings

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_settings.cors_origins),
        # Vite falls back to another port (e.g. 5174) when 5173 is busy; accept any loopback dev origin.
        allow_origin_regex=LOOPBACK_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.exception_handler(UnknownFieldError)
    async def _handle_unknown_field(_request: Request, exc: UnknownFieldError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @application.exception_handler(RequestValidationError)
    async def _handle_request_validation(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @application.exception_handler(ProfileUnavailableError)
    async def _handle_profile_unavailable(
        _request: Request, exc: ProfileUnavailableError
    ) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @application.exception_handler(DatasetIntegrityError)
    async def _handle_dataset_integrity(
        _request: Request, exc: DatasetIntegrityError
    ) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @application.exception_handler(Exception)
    async def _handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error processing %s %s", request.method, request.url.path, exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "An unexpected internal server error occurred."},
        )

    api_prefix = "/api/v1"
    application.include_router(health.router, prefix=api_prefix)
    application.include_router(rotations.router, prefix=api_prefix)
    application.include_router(crops.router, prefix=api_prefix)
    application.include_router(meta.router, prefix=api_prefix)
    application.include_router(locations.router, prefix=api_prefix)
    application.include_router(locations.regions_router, prefix=api_prefix)
    application.include_router(geocode.router, prefix=api_prefix)

    return application


app = create_app()
