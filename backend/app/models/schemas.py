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
    eto_mm: Optional[float] = None  # FAO-56 reference evapotranspiration, monthly total (live POWER only)
    heavy_rain_days_ge_25mm: Optional[int] = None  # days with >= 25 mm rain (daily POWER only)


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


EquipmentId = Literal[
    "seed_drill",          # line sowing of small seeds (wheat, lentil, canola, ...)
    "combine_harvester",   # grain harvest by machine
    "rice_transplanting",  # puddling + transplant crew or machine
    "picking_labour",      # many hand pickings (cotton, chilli, vegetables)
    "orchard_commitment",  # land committed to trees for 5+ years
    "daily_market_access", # perishable produce sold within days (vegetables, melons)
]


class FarmConstraints(_ContractBaseModel):
    """Farmer limits in real units. The client converts units (inches, acre-feet, m3, tubewell
    hours, PKR/acre) before sending. None means "not given" and is never treated as zero."""

    # Irrigation water the farmer can apply per crop season, depth over the field (mm).
    # When given it replaces the irrigation tier's assumed amount in the water balance.
    water_available_mm: Optional[float] = Field(None, ge=0.0, le=3000.0)
    # Minimum acceptable gross crop value per hectare per year (USD; client converts from PKR/acre).
    min_income_usd_ha: Optional[float] = Field(None, ge=0.0)
    # Risk tolerance: how many failed seasons out of 10 the farmer can accept (0..10).
    max_bad_seasons_in_10: Optional[int] = Field(None, ge=0, le=10)
    # Equipment / labour / commitments the farmer does NOT have.
    unavailable_equipment: list[EquipmentId] = Field(default_factory=list)


class FarmMonth(_ContractBaseModel):
    """One calendar month of a rotation's typical year ("Your farm's year")."""

    month: int = Field(..., ge=1, le=12)
    crops: list[str] = Field(default_factory=list)  # crop names on the field this month
    cover_crop: bool = False  # True when the only crop is the cover crop
    bare: bool = False  # no living crop in this month
    stage: Optional[str] = None  # sowing | growing | flowering | harvest (main crop)
    heat_risk: Optional[float] = None  # share of past years with heat above the crop's limit (0..1)
    frost_risk: Optional[float] = None  # share of past years with frost while a frost-sensitive crop grows
    dry_risk: Optional[float] = None  # share of past years where crop water demand exceeded rain
    heavy_rain_risk: Optional[float] = None  # share of past years with >=1 day of rain >= 25 mm
    erosion_alert: bool = False  # bare AND heavy rain likely
    ndvi: Optional[float] = None  # observed MODIS greenness for this calendar month (site, not rotation)
    opportunity: bool = False  # bare, not too hot/cold/dry: window for a short or cover crop


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
    label: Optional[str] = None  # plain-language name of the measurement
    group: Optional[str] = None  # climate | water | soil | terrain | crop | market | farm
    source_url: Optional[str] = None


class Insight(_ContractBaseModel):
    """One plain-language finding with the authority that supports it."""

    kind: Literal["benefit", "risk", "gap", "check"]
    topic: str  # water | heat | frost | nitrogen | cover | pest | income | soil | terrain | climate | data | farm
    title: str
    detail: str
    source: Optional[str] = None
    source_url: Optional[str] = None


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
    insights: list[Insight] = Field(default_factory=list)
    annual_value_usd_ha: Optional[float] = None
    # Deterministic shortlist: current rotation + best option of each strategy type that fits.
    shortlisted: bool = True
    shortlist_reason: Optional[str] = None  # e.g. "Your current rotation", "Best water-saving option"
    fits_constraints: bool = True
    constraint_failures: list[str] = Field(default_factory=list)  # plain sentences, one per failed limit
    farm_year: list[FarmMonth] = Field(default_factory=list)  # 12 entries, January..December
    key_moments: list[str] = Field(default_factory=list)  # 2-3 plain sentences about the farm year
    mean_water_need_mm: Optional[float] = None  # average seasonal crop water demand per year (mm)
    mean_irrigation_gap_mm: Optional[float] = None  # average shortfall the farmer must irrigate (mm)


class CompareResponse(_ContractBaseModel):
    field_id: str
    scenario_applied: bool
    rotations: list[RotationScore]
    data_mode: Literal["observed", "demo"]
    data_quality: dict[str, Quality]
    disclaimer: str
    # {"scored": bool, "note": str, "source": str, "source_url": str, "missing": [crop names]}
    income_status: Optional[dict] = None
    total_candidates: Optional[int] = None  # rotations scored in the province (shortlist is a subset)
    constraints_applied: Optional[dict] = None  # echo of the FarmConstraints used


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
    constraints: FarmConstraints = Field(default_factory=FarmConstraints)


class LocationInfo(_ContractBaseModel):
    lat: float
    lon: float
    region_id: str
    region_name: str
    current_rotation_id: str
    nasa_grid_cell: dict
    data_resolution_note: str
    soil_texture_class: Optional[str] = None  # USDA class derived from SoilGrids sand/clay


class LocationDataResponse(_ContractBaseModel):
    """Point-level geospatial observations, independent of crop-calendar coverage."""

    location: Location
    providers: dict[str, dict]


class RegionInfo(_ContractBaseModel):
    region_id: str
    name: str
    bbox: dict[str, float]
    note: str = ""
    country_iso3: Optional[str] = None


class LocationCompareResponse(CompareResponse):
    location: LocationInfo
    analysis_type: str
    warnings: list[str]
    data_retrieval: dict
    profile: FieldProfile  # live temporary profile (monthly climate, climatology, soil, terrain, now)
    now_status: NowStatus
    now_reasons: list[str]
