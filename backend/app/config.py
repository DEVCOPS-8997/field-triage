"""Backend configuration and environment resolution for Field Shift Advisor."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

OperationalDataMode = Literal["demo", "processed"]
PublicDataMode = Literal["demo", "observed"]

# Resolve repository root reliably regardless of current working directory:
# backend/app/config.py -> parents[0]=app, parents[1]=backend, parents[2]=repo root
BACKEND_DIR: Path = Path(__file__).resolve().parents[1]
REPO_ROOT: Path = BACKEND_DIR.parent

# Load .env from repo root (and backend/.env as secondary fallback) without overriding active env vars
load_dotenv(REPO_ROOT / ".env", override=False)
load_dotenv(BACKEND_DIR / ".env", override=False)

DEFAULT_CORS_ORIGINS: tuple[str, ...] = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
DEFAULT_NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
DEFAULT_NASA_POWER_TIMEOUT_SECONDS = 15.0
DEFAULT_POWER_CACHE_TTL_SECONDS = 900


def map_operational_to_public_mode(mode: str) -> PublicDataMode:
    """Map operational DATA_MODE ('demo'|'processed') to public schema data_mode ('demo'|'observed')."""
    normalized = mode.strip().lower()
    if normalized == "demo":
        return "demo"
    if normalized == "processed":
        return "observed"
    raise ValueError(
        f"Invalid DATA_MODE '{mode}'. Expected 'demo' or 'processed'."
    )


def _parse_cors_origins(raw_origins: str | None) -> list[str]:
    origins: list[str] = list(DEFAULT_CORS_ORIGINS)
    if raw_origins:
        for item in raw_origins.split(","):
            cleaned = item.strip()
            if cleaned and cleaned not in origins:
                origins.append(cleaned)
    return origins


@dataclass(frozen=True)
class Settings:
    """Immutable runtime configuration resolved from environment variables."""

    repo_root: Path
    data_dir: Path
    data_mode: OperationalDataMode
    cors_origins: tuple[str, ...]
    nasa_power_base_url: str
    nasa_power_timeout_seconds: float
    power_cache_ttl_seconds: int
    # Dynamic location analysis (historical NASA POWER by coordinates)
    power_history_start_year: int = 2005
    power_history_ttl_hours: float = 24.0
    power_history_timeout_seconds: float = 60.0
    power_cache_dir: Path = REPO_ROOT / "data" / "cache" / "power"
    location_rate_limit_per_minute: int = 10
    location_data_cache_dir: Path = REPO_ROOT / "data" / "cache" / "location"
    location_provider_timeout_seconds: float = 20.0
    # MODIS NDVI (MOD13Q1 v061) per point: ORNL DAAC web service first, then NASA AppEEARS.
    ndvi_cache_dir: Path = REPO_ROOT / "data" / "cache" / "ndvi"
    ndvi_enabled: bool = True
    ornl_modis_url: str = "https://modis.ornl.gov/rst/api/v1"
    appeears_url: str = "https://appeears.earthdatacloud.nasa.gov/api"
    earthdata_username: str | None = None
    earthdata_password: str | None = None
    ndvi_task_timeout_seconds: float = 1800.0

    @property
    def public_data_mode(self) -> PublicDataMode:
        """Public contract data_mode ('demo' or 'observed') corresponding to operational DATA_MODE."""
        return map_operational_to_public_mode(self.data_mode)

    @property
    def demo_profiles_dir(self) -> Path:
        return self.data_dir / "demo" / "profiles"

    @property
    def processed_dir(self) -> Path:
        return self.data_dir / "processed"

    def resolve_profile_path(self, field_id: str) -> Path:
        """Resolve per-field profile JSON path according to operational DATA_MODE."""
        if self.data_mode == "demo":
            return self.demo_profiles_dir / f"{field_id}.json"
        if self.data_mode == "processed":
            return self.processed_dir / field_id / "profile.json"
        raise ValueError(f"Unsupported DATA_MODE '{self.data_mode}'.")


def get_settings(
    *,
    data_mode: str | None = None,
    data_dir: Path | str | None = None,
) -> Settings:
    """Build Settings from environment with optional explicit overrides for testing."""
    raw_mode = (data_mode if data_mode is not None else os.getenv("DATA_MODE", "demo")).strip().lower()
    if raw_mode not in ("demo", "processed"):
        raise ValueError(
            f"Invalid DATA_MODE '{raw_mode}'. Permitted values are 'demo' and 'processed'."
        )
    resolved_mode: OperationalDataMode = "demo" if raw_mode == "demo" else "processed"

    if data_dir is not None:
        resolved_data_dir = Path(data_dir).expanduser().resolve()
    else:
        env_data_dir = os.getenv("DATA_DIR")
        if env_data_dir:
            candidate = Path(env_data_dir).expanduser()
            resolved_data_dir = (
                candidate.resolve()
                if candidate.is_absolute()
                else (REPO_ROOT / candidate).resolve()
            )
        else:
            resolved_data_dir = (REPO_ROOT / "data").resolve()

    cors_origins = tuple(_parse_cors_origins(os.getenv("CORS_ORIGINS")))
    power_url = os.getenv("NASA_POWER_BASE_URL", DEFAULT_NASA_POWER_URL).strip()

    raw_timeout = os.getenv("NASA_POWER_TIMEOUT_SECONDS", str(DEFAULT_NASA_POWER_TIMEOUT_SECONDS))
    try:
        timeout_seconds = float(raw_timeout)
    except ValueError as exc:
        raise ValueError(f"Invalid NASA_POWER_TIMEOUT_SECONDS '{raw_timeout}'.") from exc
    if timeout_seconds <= 0:
        raise ValueError("NASA_POWER_TIMEOUT_SECONDS must be positive.")

    raw_ttl = os.getenv("POWER_LIVE_CACHE_TTL_SECONDS", str(DEFAULT_POWER_CACHE_TTL_SECONDS))
    try:
        cache_ttl = int(raw_ttl)
    except ValueError as exc:
        raise ValueError(f"Invalid POWER_LIVE_CACHE_TTL_SECONDS '{raw_ttl}'.") from exc

    def _env_num(name: str, default: float, cast=float):
        raw = os.getenv(name)
        if raw is None or raw == "":
            return default
        try:
            return cast(raw)
        except ValueError as exc:
            raise ValueError(f"Invalid {name} '{raw}'.") from exc

    cache_dir_env = os.getenv("POWER_CACHE_DIR")
    cache_dir = (
        Path(cache_dir_env).expanduser() if cache_dir_env else REPO_ROOT / "data" / "cache" / "power"
    )
    if not cache_dir.is_absolute():
        cache_dir = (REPO_ROOT / cache_dir).resolve()

    return Settings(
        repo_root=REPO_ROOT,
        data_dir=resolved_data_dir,
        data_mode=resolved_mode,
        cors_origins=cors_origins,
        nasa_power_base_url=power_url,
        nasa_power_timeout_seconds=timeout_seconds,
        power_cache_ttl_seconds=max(0, cache_ttl),
        power_history_start_year=int(_env_num("POWER_HISTORY_START_YEAR", 2005, int)),
        power_history_ttl_hours=float(_env_num("POWER_HISTORY_TTL_HOURS", 24.0)),
        power_history_timeout_seconds=float(_env_num("POWER_HISTORY_TIMEOUT_SECONDS", 60.0)),
        power_cache_dir=cache_dir,
        location_rate_limit_per_minute=int(_env_num("LOCATION_RATE_LIMIT_PER_MINUTE", 10, int)),
        location_data_cache_dir=(REPO_ROOT / Path(os.getenv("LOCATION_DATA_CACHE_DIR", "data/cache/location"))).resolve(),
        location_provider_timeout_seconds=float(_env_num("LOCATION_PROVIDER_TIMEOUT_SECONDS", 20.0, float)),
        ndvi_cache_dir=(REPO_ROOT / Path(os.getenv("NDVI_CACHE_DIR", "data/cache/ndvi"))).resolve(),
        ndvi_enabled=os.getenv("NDVI_ENABLED", "true").strip().lower() not in ("0", "false", "no"),
        ornl_modis_url=os.getenv("ORNL_MODIS_URL", "https://modis.ornl.gov/rst/api/v1").rstrip("/"),
        appeears_url=os.getenv("APPEEARS_URL", "https://appeears.earthdatacloud.nasa.gov/api").rstrip("/"),
        earthdata_username=(os.getenv("EARTHDATA_USERNAME") or "").strip() or None,
        earthdata_password=os.getenv("EARTHDATA_PASSWORD") or None,
        ndvi_task_timeout_seconds=float(_env_num("NDVI_TASK_TIMEOUT_SECONDS", 1800.0, float)),
    )
