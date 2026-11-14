"""API router package and FastAPI dependency providers."""

from __future__ import annotations

from fastapi import Request

from app.config import Settings, get_settings
from app.services.data_loader import DataLoader


def get_request_settings(request: Request) -> Settings:
    """Return app-configured Settings override if set, else resolve dynamically from environment."""
    override: Settings | None = getattr(request.app.state, "settings_override", None)
    if override is not None:
        return override
    return get_settings()


def get_data_loader(request: Request) -> DataLoader:
    """Provide request-scoped DataLoader backed by resolved Settings."""
    return DataLoader(settings=get_request_settings(request))
