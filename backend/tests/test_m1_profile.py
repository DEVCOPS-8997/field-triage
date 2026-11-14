"""Integration tests against the real M1 processed CSV (skipped if absent)."""
from pathlib import Path

import pytest

from app.config import get_settings
from app.services.data_loader import DataLoader
from app.utils.validation import ProfileUnavailableError

DATA = Path(__file__).resolve().parents[2] / "data"
pytestmark = pytest.mark.skipif(
    not (DATA / "processed/F01/F01_nasa_integrated_daily.csv").exists(), reason="M1 data absent"
)


def _loader():
    return DataLoader(get_settings(data_mode="processed", data_dir=DATA))


def test_f01_observed_profile():
    p = _loader().load_field_profile("F01")
    assert p.data_mode == "observed"
    assert p.data_quality["power"] == "observed" and p.data_quality["soil"] == "unavailable"
    assert all(v is None for v in p.soil.values())
    assert p.now["latest_dates"]["power"] >= "2026-01-01"


def test_other_fields_unavailable_not_faked():
    with pytest.raises(ProfileUnavailableError):
        _loader().load_field_profile("F02")
