"""Frozen Pydantic v2 data and API contracts (Execution Plan Section 6).

IMPORTANT:
- Field names, optionality, literals, and snake_case JSON keys are frozen.
- Do not rename fields without explicit cross-team coordination with M1, M3, and M4.
"""

from __future__ import annotations

import math
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

Quality = Literal["observed", "derived", "unavailable", "demo"]
NowStatus = Literal["FAVORABLE", "WATCH", "STRESSED"]

PRIORITY_SUM_TOLERANCE = 0.01


class _ContractBaseModel(BaseModel):
    """Shared base model enforcing finite IEEE-754 floats (no NaN/Infinity in JSON)."""

    model_config = ConfigDict(allow_inf_nan=False)


class Location(_ContractBaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=180.0)


class FieldInfo(_ContractBaseModel):
    field_id: str
    name: str
    region_id: str
    location: Location
    soil_type: Optional[str] = None
    irrigation: Literal["none", "limited", "reliable"]
    market_access: Optional[int] = None
    current_rotation_id: str
    geometry: dict


class MonthRecord(_ContractBaseModel):
    year: int = Field(..., ge=1900, le=2100)
    month: int = Field(..., ge=1, le=12)
    rain_mm: Optional[float] = None
    tmean_c: Optional[float] = None
    tmax_mean_c: Optional[float] = None
    tmin_mean_c: Optional[float] = None
    heat_days_ge: dict[str, int] = Field(default_factory=dict)
    frost_days_le_0c: Optional[int] = None
    dry_days_lt_1mm: Optional[int] = None
    smap_rootzone_m3m3: Optional[float] = None
    ndvi_mean: Optional[float] = None


class FieldProfile(_ContractBaseModel):
    field_id: str
    period_start: str
    period_end: str
    n_years: int = Field(..., ge=0)
    monthly: list[MonthRecord]
    climatology: dict[str, Optional[float | list[float]]]
    soil: dict[str, Optional[float]]
    terrain: dict[str, Optional[float]]
    now: dict[str, Optional[float | str | dict]]
    data_mode: Literal["observed", "demo"]
    data_sources: dict[str, str]
    data_quality: dict[str, Quality]


class Priorities(_ContractBaseModel):
    w_water: float = 0.25
    w_soil: float = 0.25
    w_income: float = 0.25
    w_resilience: float = 0.25

    @model_validator(mode="after")
    def _validate_and_normalize_weights(self) -> "Priorities":
        weights = (self.w_water, self.w_soil, self.w_income, self.w_resilience)
        for name, val in zip(
            ("w_water", "w_soil", "w_income", "w_resilience"),
            weights,
            strict=True,
        ):
            if not math.isfinite(val):
                raise ValueError(f"Priority '{name}' must be a finite number.")
            if val < 0.0:
                raise ValueError(
                    f"Priority '{name}' must be non-negative (got {val})."
                )

        total = sum(weights)
        if total <= 0.0:
            raise ValueError("Priority weights cannot sum to zero.")
        if abs(total - 1.0) > PRIORITY_SUM_TOLERANCE:
            raise ValueError(
                f"Priority weights must sum to 1.0 (±{PRIORITY_SUM_TOLERANCE}); got {total:.6f}."
            )

        # Normalize minor slider floating-point drift within permitted tolerance
        if total != 1.0:
            self.w_water = self.w_water / total
            self.w_soil = self.w_soil / total
            self.w_income = self.w_income / total
            self.w_resilience = self.w_resilience / total
        return self


class Scenario(_ContractBaseModel):
    rain_multiplier: float = Field(1.0, ge=0.6, le=1.4)
    temp_delta_c: float = Field(0.0, ge=0.0, le=4.0)


class CompareRequest(_ContractBaseModel):
    field_id: str
    priorities: Priorities = Field(default_factory=Priorities)
    scenario: Scenario = Field(default_factory=Scenario)
    rotation_ids: Optional[list[str]] = None


class EvidenceItem(_ContractBaseModel):
    variable: str
    value: Optional[float | str] = None
    unit: str
    source: str
    interpretation: str


class RotationScore(_ContractBaseModel):
    rotation_id: str
    label: str
    strategy_type: str
    is_existing: bool
    scores: dict[str, float]
    overall: float
    overall_low: float
    overall_high: float
    rank: int
    confidence: Literal["HIGH", "MEDIUM", "LOW"]
    why: list[str]
    benefits: list[str]
    risks: list[str]
    data_gaps: list[str]
    needs_local_review: list[str]
    evidence: list[EvidenceItem]


class CompareResponse(_ContractBaseModel):
    field_id: str
    scenario_applied: bool
    rotations: list[RotationScore]
    data_mode: Literal["observed", "demo"]
    data_quality: dict[str, Quality]
    disclaimer: str


# Additional auxiliary endpoint response schemas (non-conflicting with Section 6 frozen contracts)
class HealthResponse(_ContractBaseModel):
    status: Literal["ok"] = "ok"
    service: str = "field-shift-advisor"
    data_mode: Literal["observed", "demo"]


class NowResponse(_ContractBaseModel):
    field_id: str
    now_status: NowStatus
    now_reasons: list[str]
    window_start: Optional[str] = None
    window_end: Optional[str] = None
    now: dict[str, Optional[float | str | dict]]
    data_mode: Literal["observed", "demo"]
    data_sources: dict[str, str]
    data_quality: dict[str, Quality]
    disclaimer: str


class LocationCompareRequest(_ContractBaseModel):
    """Dynamic GPS-based comparison. Provide `current_rotation_id` or `current_crop`."""

    location: Location
    irrigation: Literal["none", "limited", "reliable"]
    current_rotation_id: Optional[str] = None
    current_crop: Optional[str] = None
    priorities: Priorities = Field(default_factory=Priorities)
    scenario: Scenario = Field(default_factory=Scenario)
    rotation_ids: Optional[list[str]] = None


class LocationInfo(_ContractBaseModel):
    lat: float
    lon: float
    region_id: str
    region_name: str
    current_rotation_id: str
    nasa_grid_cell: dict
    data_resolution_note: str


class LocationCompareResponse(CompareResponse):
    location: LocationInfo
    analysis_type: str
    warnings: list[str]
    data_retrieval: dict
