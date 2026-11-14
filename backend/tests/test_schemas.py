"""Contract and validation tests for frozen Pydantic schemas (`schemas.py`) and `api.ts` parity."""

from __future__ import annotations

import math
from pathlib import Path
import re

import pytest
from pydantic import ValidationError

from app.models.schemas import (
    CompareRequest,
    CompareResponse,
    EvidenceItem,
    FieldInfo,
    FieldProfile,
    Location,
    MonthRecord,
    Priorities,
    RotationScore,
    Scenario,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_frozen_schema_exact_field_names() -> None:
    """Verify every Section 6 Pydantic model exposes the exact frozen snake_case field names."""
    assert list(Location.model_fields.keys()) == ["lat", "lon"]
    assert list(FieldInfo.model_fields.keys()) == [
        "field_id",
        "name",
        "region_id",
        "location",
        "soil_type",
        "irrigation",
        "market_access",
        "current_rotation_id",
        "geometry",
    ]
    assert list(MonthRecord.model_fields.keys()) == [
        "year",
        "month",
        "rain_mm",
        "tmean_c",
        "tmax_mean_c",
        "tmin_mean_c",
        "heat_days_ge",
        "frost_days_le_0c",
        "dry_days_lt_1mm",
        "smap_rootzone_m3m3",
        "ndvi_mean",
        "eto_mm",
    ]
    assert list(FieldProfile.model_fields.keys()) == [
        "field_id",
        "period_start",
        "period_end",
        "n_years",
        "monthly",
        "climatology",
        "soil",
        "terrain",
        "now",
        "data_mode",
        "data_sources",
        "data_quality",
    ]
    assert list(Priorities.model_fields.keys()) == [
        "w_water",
        "w_soil",
        "w_income",
        "w_resilience",
    ]
    assert list(Scenario.model_fields.keys()) == ["rain_multiplier", "temp_delta_c"]
    assert list(CompareRequest.model_fields.keys()) == [
        "field_id",
        "priorities",
        "scenario",
        "rotation_ids",
    ]
    assert list(EvidenceItem.model_fields.keys()) == [
        "variable",
        "value",
        "unit",
        "source",
        "interpretation",
        "label",
        "group",
        "source_url",
    ]
    assert list(RotationScore.model_fields.keys()) == [
        "rotation_id",
        "label",
        "strategy_type",
        "is_existing",
        "scores",
        "overall",
        "overall_low",
        "overall_high",
        "rank",
        "confidence",
        "why",
        "benefits",
        "risks",
        "data_gaps",
        "needs_local_review",
        "evidence",
        "insights",
        "annual_value_usd_ha",
    ]
    assert list(CompareResponse.model_fields.keys()) == [
        "field_id",
        "scenario_applied",
        "rotations",
        "data_mode",
        "data_quality",
        "disclaimer",
        "income_status",
    ]


def test_mutable_defaults_are_isolated() -> None:
    """Ensure `Field(default_factory=...)` prevents cross-instance state mutation."""
    m1 = MonthRecord(year=2020, month=5)
    m2 = MonthRecord(year=2020, month=6)
    m1.heat_days_ge["34"] = 9
    assert m2.heat_days_ge == {}

    r1 = CompareRequest(field_id="F01")
    r2 = CompareRequest(field_id="F02")
    assert r1.priorities is not r2.priorities
    assert r1.scenario is not r2.scenario


def test_priorities_validation_and_normalization() -> None:
    """Verify non-negativity, zero-sum rejection, ±0.01 tolerance, and exact normalization."""
    default_p = Priorities()
    assert math.isclose(
        default_p.w_water + default_p.w_soil + default_p.w_income + default_p.w_resilience,
        1.0,
    )

    # Minor slider rounding drift (sum = 1.004) within 0.01 is accepted and normalized to 1.0
    drifted = Priorities(w_water=0.251, w_soil=0.251, w_income=0.251, w_resilience=0.251)
    assert math.isclose(
        drifted.w_water + drifted.w_soil + drifted.w_income + drifted.w_resilience,
        1.0,
        rel_tol=1e-12,
    )

    # Negative weight rejected
    with pytest.raises(ValidationError):
        Priorities(w_water=-0.1, w_soil=0.5, w_income=0.3, w_resilience=0.3)

    # Zero total rejected
    with pytest.raises(ValidationError):
        Priorities(w_water=0.0, w_soil=0.0, w_income=0.0, w_resilience=0.0)

    # Materially invalid sum outside ±0.01 rejected
    with pytest.raises(ValidationError):
        Priorities(w_water=0.4, w_soil=0.4, w_income=0.4, w_resilience=0.0)


def test_scenario_bounds_and_nan_rejection() -> None:
    """Verify Scenario bounds [0.6..1.4] and [0..4] plus NaN/Infinity rejection."""
    valid = Scenario(rain_multiplier=0.6, temp_delta_c=4.0)
    assert valid.rain_multiplier == 0.6
    assert valid.temp_delta_c == 4.0

    with pytest.raises(ValidationError):
        Scenario(rain_multiplier=0.59, temp_delta_c=0.0)
    with pytest.raises(ValidationError):
        Scenario(rain_multiplier=1.41, temp_delta_c=0.0)
    with pytest.raises(ValidationError):
        Scenario(rain_multiplier=1.0, temp_delta_c=-0.1)
    with pytest.raises(ValidationError):
        Scenario(rain_multiplier=1.0, temp_delta_c=4.1)
    with pytest.raises(ValidationError):
        MonthRecord(year=2021, month=7, rain_mm=float("nan"))


def test_data_mode_literal_rejects_operational_processed_string(
    f01_demo_profile: FieldProfile,
) -> None:
    """Public schema `data_mode` must only accept 'observed' or 'demo', never 'processed'."""
    raw = f01_demo_profile.model_dump()
    raw["data_mode"] = "processed"
    with pytest.raises(ValidationError):
        FieldProfile.model_validate(raw)


def test_typescript_contract_mirrors_frozen_pydantic_models() -> None:
    """Ensure `frontend/src/types/api.ts` exists and mirrors every frozen Section 6 interface and field."""
    ts_path = REPO_ROOT / "frontend" / "src" / "types" / "api.ts"
    assert ts_path.is_file(), "frontend/src/types/api.ts must exist"
    content = ts_path.read_text(encoding="utf-8")

    models_to_check = {
        "Location": Location,
        "FieldInfo": FieldInfo,
        "MonthRecord": MonthRecord,
        "FieldProfile": FieldProfile,
        "Priorities": Priorities,
        "Scenario": Scenario,
        "CompareRequest": CompareRequest,
        "EvidenceItem": EvidenceItem,
        "RotationScore": RotationScore,
        "CompareResponse": CompareResponse,
    }

    for interface_name, model_cls in models_to_check.items():
        block_match = re.search(
            rf"export interface {interface_name}\s*\{{([^}}]+)\}}",
            content,
            re.MULTILINE,
        )
        assert block_match is not None, f"Missing interface {interface_name} in api.ts"
        block_body = block_match.group(1)
        ts_fields = re.findall(r"^\s*([a-zA-Z0-9_]+)\??\s*:", block_body, re.MULTILINE)
        assert ts_fields == list(model_cls.model_fields.keys()), (
            f"Field mismatch between Pydantic {interface_name} and TypeScript api.ts"
        )
