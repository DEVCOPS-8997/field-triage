"""Tests for `config.py` and `data_loader.py` across M3 datasets and demo/processed modes."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config import Settings, get_settings, map_operational_to_public_mode
from app.services.data_loader import DataLoader, PILLAR_TO_METADATA_ID
from app.utils.validation import (
    DatasetIntegrityError,
    ProfileUnavailableError,
    UnknownFieldError,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
REAL_DATA_DIR = REPO_ROOT / "data"


def test_operational_to_public_mode_mapping() -> None:
    assert map_operational_to_public_mode("demo") == "demo"
    assert map_operational_to_public_mode("processed") == "observed"
    with pytest.raises(ValueError):
        map_operational_to_public_mode("invalid_mode")

    demo_cfg = get_settings(data_mode="demo", data_dir=REAL_DATA_DIR)
    proc_cfg = get_settings(data_mode="processed", data_dir=REAL_DATA_DIR)
    assert demo_cfg.public_data_mode == "demo"
    assert proc_cfg.public_data_mode == "observed"
    assert demo_cfg.resolve_profile_path("F01") == REAL_DATA_DIR.resolve() / "demo" / "profiles" / "F01.json"
    assert proc_cfg.resolve_profile_path("F01") == REAL_DATA_DIR.resolve() / "processed" / "F01" / "profile.json"


def test_m3_committed_datasets_load_and_cross_reference_cleanly() -> None:
    """Verify all 5 existing M3 JSON files load cleanly and pass relational checks."""
    loader = DataLoader(settings=get_settings(data_mode="demo", data_dir=REAL_DATA_DIR))
    catalog = loader.load_catalog()

    assert len(catalog.fields) == 8
    assert [f.field_id for f in catalog.fields] == [f"F0{i}" for i in range(1, 9)]
    assert len(catalog.crops) == 10
    assert len(catalog.rotations) == 10
    assert len(catalog.nasa_metadata) == 15
    assert catalog.parameters["validated"] is False
    assert catalog.parameters["status"] == "illustrative"

    # Every field's current_rotation_id exists and matches its region_id
    for field in catalog.fields:
        assert field.current_rotation_id in catalog.rotations_by_id
        rot = catalog.rotations_by_id[field.current_rotation_id]
        assert rot["region_id"] == field.region_id

        # Internal raw metadata (`source`, `boundary_source`) is preserved without altering FieldInfo
        raw_meta = loader.get_field_raw_metadata(field.field_id)
        assert raw_meta["source"] == "farmer_input"
        assert raw_meta["boundary_source"] == "demo_polygon"


def test_metadata_id_mapping_preserves_m3_identifiers() -> None:
    """Verify explicit pillar -> nasa_metadata.json ID mapping without altering M3 IDs."""
    loader = DataLoader(settings=get_settings(data_mode="demo", data_dir=REAL_DATA_DIR))

    expected_names = {
        "power": "NASA POWER",
        "smap": "SMAP L4 SPL4SMGP v007",
        "modis": "MODIS MOD13Q1 v061",
        "soil": "SoilGrids (non-NASA)",
        "terrain": "SRTM",
    }
    for pillar, expected_title in expected_names.items():
        meta_entry = loader.get_metadata_for_pillar(pillar)
        assert meta_entry is not None
        assert meta_entry["id"] == PILLAR_TO_METADATA_ID[pillar]
        assert meta_entry["name"] == expected_title


def test_demo_and_processed_profile_loading_preserves_nulls(
    demo_settings: Settings,
    processed_settings: Settings,
) -> None:
    """Verify `demo` and `processed` profile loading and strict `None` preservation."""
    demo_loader = DataLoader(settings=demo_settings)
    proc_loader = DataLoader(settings=processed_settings)

    p_demo = demo_loader.load_field_profile("F01")
    p_obs = proc_loader.load_field_profile("F01")

    assert p_demo.data_mode == "demo"
    assert p_obs.data_mode == "observed"

    # Pre-2015 SMAP monthly entries must remain None (never converted to 0.0)
    jan_2014 = next(m for m in p_demo.monthly if m.year == 2014 and m.month == 1)
    assert jan_2014.smap_rootzone_m3m3 is None


def test_unknown_field_and_missing_or_corrupt_profiles(sandbox_data_dir: Path) -> None:
    """Verify 404 vs 503 exception separation and rejection of malformed/mismatched profiles."""
    loader = DataLoader(settings=get_settings(data_mode="demo", data_dir=sandbox_data_dir))

    with pytest.raises(UnknownFieldError):
        loader.get_field("F99")
    with pytest.raises(UnknownFieldError):
        loader.load_field_profile("F99")

    # Missing profile file -> ProfileUnavailableError (503)
    f02_path = sandbox_data_dir / "demo" / "profiles" / "F02.json"
    f02_path.unlink()
    with pytest.raises(ProfileUnavailableError):
        loader.load_field_profile("F02")

    # Non-standard JSON NaN constant -> ProfileUnavailableError (503)
    f03_path = sandbox_data_dir / "demo" / "profiles" / "F03.json"
    raw_text = f03_path.read_text(encoding="utf-8").replace("468.0", "NaN")
    f03_path.write_text(raw_text, encoding="utf-8")
    with pytest.raises(ProfileUnavailableError):
        loader.load_field_profile("F03")

    # Mismatched data_mode ('observed' inside demo/profiles) -> ProfileUnavailableError
    f04_path = sandbox_data_dir / "demo" / "profiles" / "F04.json"
    f04_obj = json.loads(f04_path.read_text(encoding="utf-8"))
    f04_obj["data_mode"] = "observed"
    f04_path.write_text(json.dumps(f04_obj), encoding="utf-8")
    with pytest.raises(ProfileUnavailableError):
        loader.load_field_profile("F04")


def test_corrupt_parameters_rejected(sandbox_data_dir: Path) -> None:
    """Ensure zero/negative denominators in parameters.json raise DatasetIntegrityError."""
    params_path = sandbox_data_dir / "parameters.json"
    params_obj = json.loads(params_path.read_text(encoding="utf-8"))
    params_obj["water_gap_ref_mm"] = 0
    params_path.write_text(json.dumps(params_obj), encoding="utf-8")

    loader = DataLoader(settings=get_settings(data_mode="demo", data_dir=sandbox_data_dir))
    with pytest.raises(DatasetIntegrityError):
        loader.load_catalog()
