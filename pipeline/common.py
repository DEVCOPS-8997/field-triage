
from pathlib import Path
from datetime import date, timedelta
import json

import requests


# Project folders
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"

# NASA POWER API
POWER_API_URL = (
    "https://power.larc.nasa.gov/api/temporal/daily/point"
)

POWER_PARAMETERS = [
    "PRECTOTCORR",
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "RH2M",
    "ALLSKY_SFC_SW_DWN",
]


def get_power_end_date():
    """Return today's date minus five days."""
    return date.today() - timedelta(days=5)


def get_field_raw_dir(field_id: str) -> Path:
    """Create and return a field's raw-data directory."""
    folder = RAW_DIR / field_id
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def save_json(data: dict, output_path: Path):
    """Save a dictionary as formatted JSON."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=4)


def request_json(url: str, params: dict) -> dict:
    """Make an HTTP GET request and return its JSON response."""
    response = requests.get(
        url,
        params=params,
        timeout=120
    )

    response.raise_for_status()
    return response.json()
