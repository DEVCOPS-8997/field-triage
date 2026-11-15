"""Deterministic multi-season crop-rotation decision engine (Execution Plan Section 7).

Core engineering invariants:
1. Purely deterministic mathematical calculation — zero LLM/AI calls and zero network requests.
2. Null means "no observation" — missing values are never coerced to zero.
3. All externalized agronomic thresholds/weights are read from `parameters.json`.
4. `is_existing` is strictly `rotation['rotation_id'] == field.current_rotation_id`.
5. Cross-year winter crop calendars (`sow_month > harvest_month`) span year `y` into `y + 1`.
6. Cover crops (`cover_crop`) contribute to `soil_health` and `erosion` ground cover only,
   not cash-crop `income`, `water`, `resilience`, or `pest_break`.
7. Inter-annual uncertainty bounds (`overall_low`, `overall_high`) preserve exact 10th and 90th
   percentiles across historical years without artificial mean-clamping.
8. Synthetic `demo` data never counts toward real-world observation `coverage` in `confidence`.
9. Crop-stage aware season checks (FAO-56 four-stage curve, `crops.json` `kc` + calendar
   `stage_fractions`): heat days count only in the mid-season (reproductive) stage, frost days only
   from development through mid-season, and water demand is sum(Kc x ETo) when monthly ETo exists
   (falls back to the catalog `water_need_mm` otherwise). Supply = USDA-SCS effective rain +
   plant-available soil water (Saxton-Rawls AWC x rooting depth) + assumed irrigation.
10. Farmer limits (`FarmConstraints`) never change scores or rank; they only decide
   `fits_constraints` / `constraint_failures`:
   * `water_available_mm` replaces the irrigation tier amount per crop season in the water balance,
     and a rotation fails when any crop's average irrigation need to reach its minimum viable share
     of water (viable_water_fraction x demand - effective rain - stored soil water) exceeds it;
   * `min_income_usd_ha` fails a rotation whose known expected crop sales are below it (unknown
     income never fails; explain.py reports it as a gap);
   * `max_bad_seasons_in_10` fails when (non-viable past seasons / checked seasons) x 10 exceeds it;
   * `unavailable_equipment` fails when any crop (cash or cover) needs a listed item, from
     `parameters.json` `equipment_needs` (`by_crop` overrides `by_type`).
11. Deterministic shortlist. Every regional rotation is scored and ranked (rank 1 = best overall).
   Then: the current rotation is always shortlisted ("Your current rotation"); then, for each
   strategy type in the fixed order water_saving, soil_building, income, conventional, the
   best-ranked rotation of that type that fits the farmer's limits and is not already shortlisted
   is added ("Best <type> option for your field"). A type with no fitting rotation is skipped.
   Every other rotation has `shortlisted = False`. `total_candidates` is the number scored.
12. `farm_year` folds each rotation onto the 12 calendar months (see `farm_year.py` for the fold
   rule and risk definitions), with the same rain/temperature scenario as the season replay.
13. `mean_water_need_mm` / `mean_irrigation_gap_mm` are per-year totals: for each cash crop the
   average past-season demand (and average max(0, demand - effective rain - stored soil water)),
   summed over the rotation's crops and divided by the cycle length in years.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np

from app.models.schemas import (
    FarmConstraints,
    FarmMonth,
    FieldInfo,
    FieldProfile,
    MonthRecord,
    Priorities,
    Quality,
    Scenario,
)
from app.services.agromet import effective_rain_usda_scs, season_month_weights, temperature_eto_factor
from app.services.data_loader import FIVE_CONFIDENCE_PILLARS, PILLAR_TO_METADATA_ID
from app.services.farm_year import FarmYearResult, build_farm_year, cycle_layout
from app.utils.validation import (
    ProfileUnavailableError,
    is_valid_number,
    select_and_validate_candidate_rotations,
    validate_crop_calendar,
    validate_parameters_dict,
    validate_priorities,
    validate_scenario,
)

ConfidenceLiteral = Literal["HIGH", "MEDIUM", "LOW"]
SHORTLIST_ORDER: tuple[tuple[str, str], ...] = (
    ("water_saving", "Best water-saving option for your field"),
    ("soil_building", "Best soil-building option for your field"),
    ("income", "Best income option for your field"),
    ("conventional", "Best conventional option for your field"),
)
CURRENT_REASON = "Your current rotation"
EQUIPMENT_LABELS: dict[str, str] = {
    "seed_drill": "a seed drill",
    "combine_harvester": "a combine harvester",
    "rice_transplanting": "a rice transplanting crew or machine",
    "picking_labour": "labour for many hand pickings",
    "orchard_commitment": "land you can give to trees for 5 years or more",
    "daily_market_access": "a market you can reach every few days",
}
BareFractionSource = Literal["modis_ndvi", "crop_calendar"]
WaterDemandSource = Literal["fao56_kc_eto", "catalog_water_need"]


def _clip(value: float, low: float, high: float) -> float:
    return float(min(max(value, low), high))


@dataclass(frozen=True)
class SeasonEvaluation:
    """Detailed evaluation of a single crop season `s` initiated in historical year `y`."""

    year: int
    crop_id: str
    crop_name: str
    sow_month: int
    harvest_month: int
    complete: bool
    missing_months: tuple[tuple[int, int], ...]
    is_trailing_cross_year_boundary: bool
    season_rain_mm: float | None
    irrigation_mm: float
    water_need_mm: float
    water_deficit_mm: float | None
    heat_bucket_key: str
    season_heat_days: float | None
    max_heat_days_tolerated: int
    season_frost_days: float | None
    frost_sensitive: bool
    heat_ok: bool | None
    frost_ok: bool | None
    water_ok: bool | None
    viable: bool | None
    effective_rain_mm: float | None = None
    soil_water_mm: float = 0.0
    water_demand_source: WaterDemandSource = "catalog_water_need"
    viable_water_fraction: float = 0.6
    total_frost_days: int | None = None


@dataclass(frozen=True)
class PillarCoverageReport:
    """Source availability, data quality, and Section 7 confidence assessment."""

    pillar_quality: dict[str, Quality]
    pillar_observed_available: dict[str, bool]
    coverage: float
    effective_n_years: int
    parameters_validated: bool
    confidence: ConfidenceLiteral
    missing_climate_months: int


@dataclass(frozen=True)
class RotationEvaluation:
    """Complete mathematical scoring breakdown for one candidate rotation."""

    rotation_id: str
    label: str
    strategy_type: str
    is_existing: bool
    sequence_crop_ids: tuple[str, ...]
    cover_crop_id: str | None
    scores: dict[str, float]
    soil_subscores: dict[str, float]
    overall: float
    overall_low: float
    overall_high: float
    annual_overalls: dict[int, float]
    rank: int
    confidence: ConfidenceLiteral
    season_evaluations: tuple[SeasonEvaluation, ...]
    evaluated_seasons_count: int
    viable_seasons_count: int
    heat_failure_count: int
    frost_failure_count: int
    water_failure_count: int
    incomplete_season_count: int
    mean_water_deficit_mm: float
    mean_season_rain_mm: float
    irrigation_mm: float
    living_root_share: float
    total_n_fix_kg_ha: float
    bare_fraction: float
    bare_fraction_source: BareFractionSource
    calendar_bare_fraction: float
    calendar_bare_fraction_without_cover: float
    cycle_months: int
    slope_deg_used: float | None
    heavy_rain_days_used: float | None
    annual_value_usd_ha: float | None
    crop_value_usd_ha: dict[str, float]
    market_missing: tuple[str, ...]
    income_scored: bool
    mean_water_demand_mm: float = 0.0
    mean_effective_rain_mm: float = 0.0
    soil_water_mm: float = 0.0
    water_demand_source: str = "catalog_water_need"
    soil_awc_m3m3: float | None = None
    # Farmer limits, shortlist and farm year (filled in evaluate_rotations).
    fits_constraints: bool = True
    constraint_failures: tuple[tuple[str, str], ...] = ()  # (limit kind, plain sentence)
    income_unchecked: bool = False  # a minimum income was given but this rotation's income is unknown
    shortlisted: bool = False
    shortlist_reason: str | None = None
    farm_year: tuple[FarmMonth, ...] = ()
    farm_year_result: FarmYearResult | None = None
    mean_water_need_mm: float | None = None
    mean_irrigation_gap_mm: float | None = None


@dataclass(frozen=True)
class EngineComparisonResult:
    """Top-level pure mathematical output consumed by `explain.py` and API routes."""

    field_id: str
    scenario_applied: bool
    evaluations: tuple[RotationEvaluation, ...]
    coverage_report: PillarCoverageReport
    constraints: FarmConstraints | None = None
    total_candidates: int = 0


def get_season_year_months(
    sow_year: int,
    sow_month: int,
    harvest_month: int,
) -> list[tuple[int, int]]:
    """Build ordered `(year, month)` window for same-year or cross-year winter crops."""
    if sow_month <= harvest_month:
        return [(sow_year, m) for m in range(sow_month, harvest_month + 1)]
    return [(sow_year, m) for m in range(sow_month, 13)] + [
        (sow_year + 1, m) for m in range(1, harvest_month + 1)
    ]


def select_heat_bucket(
    heat_threshold_c: float,
    temp_delta_c: float,
    heat_buckets_c: list[int | float],
) -> str:
    """Select nearest heat-day bucket string key to `(heat_threshold_c - temp_delta_c)`.

    Tie-breaking selects the lower temperature bucket (physically conservative under warming).
    """
    effective_threshold = float(heat_threshold_c) - float(temp_delta_c)
    sorted_buckets = sorted(float(b) for b in heat_buckets_c)
    nearest = min(
        sorted_buckets,
        key=lambda b: (abs(b - effective_threshold), b),
    )
    if nearest.is_integer():
        return str(int(nearest))
    return str(nearest)


def compute_calendar_bare_fraction(
    sequence_crops: list[dict[str, Any]],
    cover_crop: dict[str, Any] | None,
    region_id: str,
) -> tuple[float, float, int]:
    """Compute `(bare_fraction_with_cover, bare_fraction_without_cover, cycle_months)` from calendars.

    Handles both 12-month double-cropping rotations (e.g., Punjab cotton-wheat) and multi-year
    rotations (e.g., US Midwest 24-month corn-soybean or 36-month corn-soybean-wheat), plus
    optional fallow-window cover crops (e.g., winter cereal rye).
    """
    layout = cycle_layout(sequence_crops, cover_crop, region_id)
    cycle_months = layout.cycle_months
    cash_covered: set[int] = set()
    for st, en in zip(layout.starts, layout.ends, strict=True):
        for abs_m in range(st, en + 1):
            cash_covered.add(layout.position(abs_m))

    bare_without_cover = _clip(1.0 - (len(cash_covered) / float(cycle_months)), 0.0, 1.0)
    if cover_crop is None:
        return bare_without_cover, bare_without_cover, cycle_months

    with_cover_set = set(cash_covered)
    for c_start, c_end in layout.cover_spans:
        for abs_m in range(c_start, c_end + 1):
            with_cover_set.add(layout.position(abs_m))
    bare_with_cover = _clip(1.0 - (len(with_cover_set) / float(cycle_months)), 0.0, 1.0)
    return bare_with_cover, bare_without_cover, cycle_months


def compute_soil_health_score(
    sequence_crops: list[dict[str, Any]],
    cover_crop: dict[str, Any] | None,
    n_ref_kg_ha: float,
    living_root_share: float,
    weights: dict[str, Any] | None = None,
) -> tuple[float, float, float]:
    """Compute `(soil_health_score, living_root_share, total_n_kg_ha)`.

    Follows two of the USDA NRCS soil-health principles that can be computed for a rotation:
    keep living roots in the soil as long as possible (share of the cycle a crop is growing, from
    the crop calendars) and feed the soil biologically (net legume nitrogen left for the next
    crop, from the cited field studies in `crops.json`).
    """
    soil_crops = list(sequence_crops)
    if cover_crop is not None:
        soil_crops.append(cover_crop)
    total_n = float(np.sum([float(c.get("n_fix_kg_ha") or 0.0) for c in soil_crops]))
    w = weights or {}
    w_roots = float(w.get("living_roots", 0.5))
    w_n = float(w.get("nitrogen", 0.5))
    denom = (w_roots + w_n) or 1.0
    roots = _clip(living_root_share, 0.0, 1.0)
    n_term = _clip(total_n / float(n_ref_kg_ha), 0.0, 1.0)
    score = 100.0 * _clip((w_roots * roots + w_n * n_term) / denom, 0.0, 1.0)
    return score, roots, total_n


def compute_pest_break_score(
    sequence_crops: list[dict[str, Any]],
    same_family_score: float,
    diff_family_score: float,
) -> float:
    """Compute pest-break score across cyclic consecutive cash-crop transitions."""
    n_crops = len(sequence_crops)
    if n_crops == 1:
        return float(same_family_score)

    pair_scores: list[float] = []
    for idx in range(n_crops):
        curr_family = str(sequence_crops[idx].get("pest_family", "")).strip().lower()
        next_family = (
            str(sequence_crops[(idx + 1) % n_crops].get("pest_family", "")).strip().lower()
        )
        if curr_family and next_family and curr_family != next_family:
            pair_scores.append(float(diff_family_score))
        else:
            pair_scores.append(float(same_family_score))

    return _clip(float(np.mean(pair_scores)), 0.0, 100.0)


def compute_erosion_score(
    bare_fraction: float,
    slope_deg: float | None,
    heavy_rain_days_mean: float | None,
    heavy_ref_days: float,
) -> float:
    """Compute Section 7 erosion protection score (0 to 100) preserving null semantics."""
    # Missing slope_deg (e.g., SRTM unavailable) leaves slope multiplier unadjusted at 1.0
    slope_factor = 1.0 + (float(slope_deg) / 10.0) if is_valid_number(slope_deg) else 1.0

    if is_valid_number(heavy_rain_days_mean):
        rain_factor = _clip(float(heavy_rain_days_mean) / float(heavy_ref_days), 0.2, 1.0)
    else:
        rain_factor = 0.2

    raw_erosion_risk = _clip(float(bare_fraction) * slope_factor * rain_factor, 0.0, 1.0)
    return 100.0 * (1.0 - raw_erosion_risk)


def compute_crop_value(
    sequence_crops: list[dict[str, Any]],
    market_crops: dict[str, Any] | None,
    viable_share_by_crop: dict[str, float],
    cycle_months: int,
) -> tuple[float | None, dict[str, float], list[str]]:
    """Expected gross crop value per hectare per year (USD) from FAOSTAT national data.

    value = sum over cash crops of (national yield x producer price x share of historical seasons
    the crop was viable at this location), divided by the cycle length in years. Returns
    `(value_or_None, per_crop_value, missing_crop_names)`; any crop without current FAOSTAT yield
    and price makes the whole rotation unscored rather than guessed.
    """
    missing: list[str] = []
    per_crop: dict[str, float] = {}
    for crop in sequence_crops:
        cid = str(crop["crop_id"])
        m = (market_crops or {}).get(cid) or {}
        y, p = m.get("yield_kg_ha"), m.get("price_usd_t")
        if not (is_valid_number(y) and is_valid_number(p)):
            missing.append(str(crop.get("name", cid)))
            continue
        per_crop[cid] = float(y) / 1000.0 * float(p) * viable_share_by_crop.get(cid, 0.0)
    if missing or not per_crop:
        return None, per_crop, missing
    years = max(cycle_months, 12) / 12.0
    return sum(per_crop.values()) / years, per_crop, []


def _has_pillar_observations(pillar: str, profile: FieldProfile) -> bool:
    """Verify whether non-null numerical data exists in FieldProfile for a given source pillar."""
    if pillar == "power":
        has_monthly_power = any(
            is_valid_number(m.rain_mm)
            and (is_valid_number(m.tmean_c) or is_valid_number(m.tmax_mean_c))
            for m in profile.monthly
        )
        return has_monthly_power or is_valid_number(
            profile.climatology.get("rain_annual_mm_mean")
        )
    if pillar == "smap":
        return is_valid_number(
            profile.climatology.get("smap_rootzone_mean_m3m3")
        ) or any(is_valid_number(m.smap_rootzone_m3m3) for m in profile.monthly)
    if pillar == "modis":
        ndvi_monthly = profile.climatology.get("ndvi_monthly_mean")
        has_ndvi_curve = isinstance(ndvi_monthly, list) and any(
            is_valid_number(v) for v in ndvi_monthly
        )
        return (
            is_valid_number(profile.climatology.get("bare_days_est_mean"))
            or is_valid_number(profile.climatology.get("ndvi_peak_mean"))
            or has_ndvi_curve
            or any(is_valid_number(m.ndvi_mean) for m in profile.monthly)
        )
    if pillar == "soil":
        return any(is_valid_number(v) for v in profile.soil.values())
    if pillar == "terrain":
        return any(is_valid_number(v) for v in profile.terrain.values())
    return False


def _resolve_pillar_quality(pillar: str, profile: FieldProfile) -> Quality:
    """Resolve effective Quality label ('observed'|'derived'|'demo'|'unavailable') for a pillar."""
    has_data = _has_pillar_observations(pillar, profile)
    meta_alias = PILLAR_TO_METADATA_ID.get(pillar, pillar)

    explicit_quality = profile.data_quality.get(pillar) or profile.data_quality.get(meta_alias)
    if explicit_quality == "unavailable" or not has_data:
        return "unavailable"

    if profile.data_mode == "demo":
        return "demo"

    if explicit_quality in ("observed", "derived", "demo"):
        return explicit_quality

    # Infer from data_mode when data is present in profile but only feature-level quality keys exist
    return "observed"


def assess_coverage_and_confidence(
    profile: FieldProfile,
    parameters: dict[str, Any],
) -> PillarCoverageReport:
    """Compute 5-pillar observation coverage and Section 7 confidence ('HIGH'|'MEDIUM'|'LOW').

    Note: Synthetic `demo` values never count as observed/derived NASA measurements.
    """
    pillar_quality: dict[str, Quality] = {}
    pillar_available: dict[str, bool] = {}

    for pillar in FIVE_CONFIDENCE_PILLARS:
        qual = _resolve_pillar_quality(pillar, profile)
        pillar_quality[pillar] = qual
        pillar_available[pillar] = (
            profile.data_mode == "observed" and qual in ("observed", "derived")
        )

    coverage = sum(1 for ok in pillar_available.values() if ok) / float(
        len(FIVE_CONFIDENCE_PILLARS)
    )

    # Count distinct years that actually carry valid monthly rainfall observations
    observed_power_years = {
        m.year for m in profile.monthly if is_valid_number(m.rain_mm)
    }
    effective_n_years = (
        min(int(profile.n_years), len(observed_power_years))
        if observed_power_years
        else 0
    )

    # Count missing climate months inside [min_year..max_year] span
    if profile.monthly:
        years_span = sorted({m.year for m in profile.monthly})
        month_lookup = {(m.year, m.month): m for m in profile.monthly}
        missing_climate_months = 0
        # Months after the newest record (the rest of the current year) have not happened yet.
        last_month = max(m.month for m in profile.monthly if m.year == years_span[-1])
        for yr in range(years_span[0], years_span[-1] + 1):
            for mo in range(1, (last_month if yr == years_span[-1] else 12) + 1):
                rec = month_lookup.get((yr, mo))
                if rec is None or not is_valid_number(rec.rain_mm):
                    missing_climate_months += 1
    else:
        missing_climate_months = 0

    validated_flag = bool(parameters.get("validated") is True)
    conf_cfg = parameters["confidence"]
    high_cov = float(conf_cfg["high_coverage"])
    med_cov = float(conf_cfg["medium_coverage"])
    high_min_years = int(conf_cfg["high_min_years"])

    if (
        coverage >= high_cov
        and effective_n_years >= high_min_years
        and validated_flag
    ):
        confidence: ConfidenceLiteral = "HIGH"
    elif coverage >= med_cov:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    return PillarCoverageReport(
        pillar_quality=pillar_quality,
        pillar_observed_available=pillar_available,
        coverage=round(coverage, 4),
        effective_n_years=effective_n_years,
        parameters_validated=validated_flag,
        confidence=confidence,
        missing_climate_months=missing_climate_months,
    )


def crop_soil_water_mm(
    crop: dict[str, Any],
    soil_awc_m3m3: float | None,
    parameters: dict[str, Any],
) -> float:
    """Plant-available soil water at sowing (mm) = AWC x rooting depth x assumed starting fill.

    Unknown soil (no SoilGrids texture) contributes 0 mm: the conservative choice, reported as a gap.
    """
    if not is_valid_number(soil_awc_m3m3):
        return 0.0
    cfg = parameters.get("soil_water", {}) or {}
    max_root = float(cfg.get("max_root_depth_cm", 150))
    start_fraction = float(cfg.get("start_fraction", 0.5))
    root_cm = min(float(crop.get("root_depth_cm", 100)), max_root)
    return float(soil_awc_m3m3) * root_cm * 10.0 * start_fraction


def crop_viable_water_fraction(crop: dict[str, Any], parameters: dict[str, Any]) -> float:
    """Minimum share of seasonal crop water demand that must be met; lower for drought-tolerant crops."""
    by_tol = parameters.get("viable_water_fraction_by_drought_tolerance") or {}
    key = str(crop.get("drought_tolerance"))
    if key in by_tol and is_valid_number(by_tol[key]):
        return float(by_tol[key])
    return float(parameters["viable_water_fraction"])


def _evaluate_single_season(
    sow_year: int,
    max_profile_year: int,
    crop: dict[str, Any],
    region_id: str,
    monthly_index: dict[tuple[int, int], MonthRecord],
    irrigation_mm: float,
    viable_water_fraction: float,
    heat_buckets_c: list[int | float],
    scenario: Scenario,
    soil_water_mm: float = 0.0,
    frost_damage_days: float = 1.0,
) -> SeasonEvaluation:
    sow_month, harvest_month = validate_crop_calendar(crop, region_id)
    window = get_season_year_months(sow_year, sow_month, harvest_month)
    calendar = (crop.get("calendars") or {}).get(region_id, {}) or {}
    kc = crop.get("kc") if isinstance(crop.get("kc"), list) and len(crop["kc"]) == 3 else None
    stage_weights = season_month_weights(len(window), calendar.get("stage_fractions"), kc)
    bucket_key = select_heat_bucket(
        float(crop["heat_threshold_c"]),
        scenario.temp_delta_c,
        heat_buckets_c,
    )
    water_need_mm = float(crop["water_need_mm"])
    max_heat_tol = int(crop["max_heat_days_tolerated"])
    frost_sensitive = bool(crop["frost_sensitive"])

    is_trailing_boundary = sow_month > harvest_month and sow_year >= max_profile_year

    missing_months: list[tuple[int, int]] = []
    window_records: list[MonthRecord] = []

    for ym in window:
        rec = monthly_index.get(ym)
        if rec is None or not is_valid_number(rec.rain_mm):
            missing_months.append(ym)
            continue
        if bucket_key not in rec.heat_days_ge or not is_valid_number(
            rec.heat_days_ge[bucket_key]
        ):
            missing_months.append(ym)
            continue
        if frost_sensitive and not is_valid_number(rec.frost_days_le_0c):
            missing_months.append(ym)
            continue
        window_records.append(rec)

    if missing_months:
        return SeasonEvaluation(
            year=sow_year,
            crop_id=str(crop["crop_id"]),
            crop_name=str(crop.get("name", crop["crop_id"])),
            sow_month=sow_month,
            harvest_month=harvest_month,
            complete=False,
            missing_months=tuple(missing_months),
            is_trailing_cross_year_boundary=is_trailing_boundary,
            season_rain_mm=None,
            irrigation_mm=irrigation_mm,
            water_need_mm=water_need_mm,
            water_deficit_mm=None,
            heat_bucket_key=bucket_key,
            season_heat_days=None,
            max_heat_days_tolerated=max_heat_tol,
            season_frost_days=None,
            frost_sensitive=frost_sensitive,
            heat_ok=None,
            frost_ok=None,
            water_ok=None,
            viable=None,
            soil_water_mm=soil_water_mm,
            viable_water_fraction=viable_water_fraction,
        )

    mult = float(scenario.rain_multiplier)
    season_rain_mm = sum(float(r.rain_mm) * mult for r in window_records if r.rain_mm is not None)
    effective_rain_mm = sum(
        effective_rain_usda_scs(float(r.rain_mm) * mult) for r in window_records if r.rain_mm is not None
    )

    # Crop water demand: sum over months of Kc x ETo (with the warming scenario raising ETo),
    # or the catalog seasonal requirement when ETo is not available for every month.
    if kc is not None and all(is_valid_number(r.eto_mm) for r in window_records):
        demand_mm = sum(
            float(w["kc"]) * float(r.eto_mm) * temperature_eto_factor(scenario.temp_delta_c, r.tmean_c)  # type: ignore[arg-type]
            for w, r in zip(stage_weights, window_records, strict=True)
        )
        demand_source: WaterDemandSource = "fao56_kc_eto"
    else:
        demand_mm = water_need_mm
        demand_source = "catalog_water_need"

    supply_mm = effective_rain_mm + soil_water_mm + irrigation_mm
    water_deficit_mm = max(0.0, demand_mm - supply_mm)

    # Heat stress counts only inside the reproductive (mid-season) stage.
    season_heat_days = sum(
        float(w["heat_weight"]) * int(r.heat_days_ge[bucket_key])
        for w, r in zip(stage_weights, window_records, strict=True)
    )

    if all(is_valid_number(r.frost_days_le_0c) for r in window_records):
        total_frost_days: int | None = sum(int(r.frost_days_le_0c) for r in window_records)  # type: ignore[arg-type]
        season_frost_days: float | None = sum(
            float(w["frost_weight"]) * int(r.frost_days_le_0c)  # type: ignore[arg-type]
            for w, r in zip(stage_weights, window_records, strict=True)
        )
    else:
        total_frost_days = None
        season_frost_days = None

    heat_ok = season_heat_days <= max_heat_tol
    frost_ok = not (
        frost_sensitive and season_frost_days is not None and season_frost_days >= frost_damage_days
    )
    water_ok = supply_mm >= (viable_water_fraction * demand_mm)
    viable = bool(heat_ok and frost_ok and water_ok)

    return SeasonEvaluation(
        year=sow_year,
        crop_id=str(crop["crop_id"]),
        crop_name=str(crop.get("name", crop["crop_id"])),
        sow_month=sow_month,
        harvest_month=harvest_month,
        complete=True,
        missing_months=(),
        is_trailing_cross_year_boundary=False,
        season_rain_mm=season_rain_mm,
        irrigation_mm=irrigation_mm,
        water_need_mm=demand_mm,
        water_deficit_mm=water_deficit_mm,
        heat_bucket_key=bucket_key,
        season_heat_days=round(season_heat_days, 2),
        max_heat_days_tolerated=max_heat_tol,
        season_frost_days=None if season_frost_days is None else round(season_frost_days, 2),
        frost_sensitive=frost_sensitive,
        heat_ok=heat_ok,
        frost_ok=frost_ok,
        water_ok=water_ok,
        viable=viable,
        effective_rain_mm=effective_rain_mm,
        soil_water_mm=soil_water_mm,
        water_demand_source=demand_source,
        viable_water_fraction=viable_water_fraction,
        total_frost_days=total_frost_days,
    )


def evaluate_rotations(
    *,
    field: FieldInfo,
    profile: FieldProfile,
    crops_by_id: dict[str, dict[str, Any]],
    rotations: list[dict[str, Any]],
    parameters: dict[str, Any],
    priorities: Priorities | None = None,
    scenario: Scenario | None = None,
    requested_rotation_ids: list[str] | None = None,
    market_crops: dict[str, Any] | None = None,
    constraints: FarmConstraints | None = None,
) -> EngineComparisonResult:
    """Evaluate, score, quantify uncertainty/confidence, and rank candidate rotations for `field`.

    `market_crops` is the FAOSTAT entry for the field's country (`data/market_faostat.json`). Without
    it, or when any candidate lacks current FAOSTAT yield and price, income is not scored and its
    priority weight is shared out over the other three components.

    `constraints` are the farmer's limits (water, minimum income, accepted bad seasons, missing
    equipment). They never change scores or rank; they set `fits_constraints` and the shortlist.
    """
    validate_parameters_dict(parameters)
    validated_priorities = validate_priorities(priorities or Priorities())
    validated_scenario = validate_scenario(scenario or Scenario())

    candidates = select_and_validate_candidate_rotations(
        field=field,
        rotations=rotations,
        crops_by_id=crops_by_id,
        requested_rotation_ids=requested_rotation_ids,
    )

    if not profile.monthly:
        raise ProfileUnavailableError(
            f"FieldProfile for '{field.field_id}' contains no monthly historical records."
        )

    monthly_index: dict[tuple[int, int], MonthRecord] = {
        (rec.year, rec.month): rec for rec in profile.monthly
    }
    sorted_years = sorted({rec.year for rec in profile.monthly})
    max_profile_year = sorted_years[-1]

    water_available = (
        float(constraints.water_available_mm)
        if constraints is not None and constraints.water_available_mm is not None
        else None
    )
    # The farmer's own water figure replaces the irrigation tier's assumed amount per crop season.
    irrigation_mm = (
        water_available if water_available is not None else float(parameters["irrigation_mm"][field.irrigation])
    )
    water_gap_ref_mm = float(parameters["water_gap_ref_mm"])
    n_ref_kg_ha = float(parameters["n_ref_kg_ha"])
    heavy_ref_days = float(parameters["heavy_ref_days"])
    # Use only thresholds the profile actually counted (live POWER profiles count every degree;
    # older pre-built profiles carry 30/34/38/42 only), so a crop is never checked against a
    # threshold with no data.
    profile_keys: set[str] | None = None
    for rec in profile.monthly:
        if rec.heat_days_ge:
            keys = set(rec.heat_days_ge)
            profile_keys = keys if profile_keys is None else (profile_keys & keys)
    heat_buckets_c = [
        b for b in parameters["heat_buckets_c"]
        if profile_keys is None or (str(int(b)) if float(b).is_integer() else str(b)) in profile_keys
    ] or list(parameters["heat_buckets_c"])
    soil_weights = parameters["soil_weights"]
    same_family_score = float(parameters["pest_break_same_family"])
    diff_family_score = float(parameters["pest_break_diff_family"])

    slope_deg_raw = profile.terrain.get("slope_deg")
    slope_deg_val = float(slope_deg_raw) if is_valid_number(slope_deg_raw) else None

    heavy_rain_raw = profile.climatology.get("heavy_rain_days_ge_25mm_mean")
    heavy_rain_val = float(heavy_rain_raw) if is_valid_number(heavy_rain_raw) else None

    bare_days_raw = profile.climatology.get("bare_days_est_mean")
    bare_days_modis = float(bare_days_raw) if is_valid_number(bare_days_raw) else None

    awc_raw = profile.soil.get("soil_awc_m3m3")
    soil_awc = float(awc_raw) if is_valid_number(awc_raw) else None
    frost_damage_days = float(parameters.get("frost_damage_days", 1.0))

    coverage_report = assess_coverage_and_confidence(profile, parameters)

    # Observed MODIS greenness curve for the farm year (site-level; never synthetic demo values).
    ndvi_raw = profile.climatology.get("ndvi_monthly_mean")
    ndvi_curve = (
        list(ndvi_raw)
        if isinstance(ndvi_raw, list)
        and profile.data_mode == "observed"
        and profile.data_quality.get("modis") in ("observed", "derived")
        else None
    )

    unranked_evals: list[RotationEvaluation] = []
    yearly_parts_by_rot: dict[str, dict[int, tuple[float, float]]] = {}

    for rot in candidates:
        rot_id = str(rot["rotation_id"])
        is_existing = rot_id == field.current_rotation_id
        seq_ids = [str(cid) for cid in rot["sequence"]]
        seq_crops = [crops_by_id[cid] for cid in seq_ids]

        cover_id_raw = rot.get("cover_crop")
        cover_id = str(cover_id_raw) if cover_id_raw else None
        cover_crop = crops_by_id[cover_id] if cover_id else None

        # Evaluate every historical year x cash-crop season
        season_evals: list[SeasonEvaluation] = []
        seasons_by_year: dict[int, list[SeasonEvaluation]] = {}

        for yr in sorted_years:
            yr_list: list[SeasonEvaluation] = []
            for crop in seq_crops:
                se = _evaluate_single_season(
                    sow_year=yr,
                    max_profile_year=max_profile_year,
                    crop=crop,
                    region_id=field.region_id,
                    monthly_index=monthly_index,
                    irrigation_mm=irrigation_mm,
                    viable_water_fraction=crop_viable_water_fraction(crop, parameters),
                    heat_buckets_c=heat_buckets_c,
                    scenario=validated_scenario,
                    soil_water_mm=crop_soil_water_mm(crop, soil_awc, parameters),
                    frost_damage_days=frost_damage_days,
                )
                season_evals.append(se)
                yr_list.append(se)
            seasons_by_year[yr] = yr_list

        valid_seasons = [se for se in season_evals if se.complete]
        if not valid_seasons:
            raise ProfileUnavailableError(
                f"FieldProfile for '{field.field_id}' has zero complete seasonal climate windows "
                f"for rotation '{rot_id}'."
            )

        incomplete_non_boundary = [
            se
            for se in season_evals
            if not se.complete and not se.is_trailing_cross_year_boundary
        ]

        viable_flags = [1.0 if se.viable else 0.0 for se in valid_seasons]
        water_deficits = [
            float(se.water_deficit_mm)
            for se in valid_seasons
            if se.water_deficit_mm is not None
        ]
        season_rains = [
            float(se.season_rain_mm)
            for se in valid_seasons
            if se.season_rain_mm is not None
        ]

        demands = [float(se.water_need_mm) for se in valid_seasons]
        eff_rains = [float(se.effective_rain_mm) for se in valid_seasons if se.effective_rain_mm is not None]
        demand_sources = {se.water_demand_source for se in valid_seasons}
        resilience_score = _clip(100.0 * float(np.mean(viable_flags)), 0.0, 100.0)
        mean_deficit_mm = float(np.mean(water_deficits))
        mean_rain_mm = float(np.mean(season_rains))
        water_score = _clip(
            100.0 * (1.0 - _clip(mean_deficit_mm / water_gap_ref_mm, 0.0, 1.0)),
            0.0,
            100.0,
        )

        cal_bare_with_cover, cal_bare_no_cover, cycle_months = (
            compute_calendar_bare_fraction(
                sequence_crops=seq_crops,
                cover_crop=cover_crop,
                region_id=field.region_id,
            )
        )

        # Soil components: soil_health (living roots + legume N), erosion, pest_break
        soil_health_score, living_roots, total_n_fix = compute_soil_health_score(
            sequence_crops=seq_crops,
            cover_crop=cover_crop,
            n_ref_kg_ha=n_ref_kg_ha,
            living_root_share=1.0 - cal_bare_with_cover,
            weights=parameters.get("soil_health_weights"),
        )

        if is_existing and bare_days_modis is not None:
            bare_fraction = _clip(bare_days_modis / 365.0, 0.0, 1.0)
            bare_source: BareFractionSource = "modis_ndvi"
        else:
            bare_fraction = cal_bare_with_cover
            bare_source = "crop_calendar"

        erosion_score = compute_erosion_score(
            bare_fraction=bare_fraction,
            slope_deg=slope_deg_val,
            heavy_rain_days_mean=heavy_rain_val,
            heavy_ref_days=heavy_ref_days,
        )
        pest_break_score = compute_pest_break_score(
            sequence_crops=seq_crops,
            same_family_score=same_family_score,
            diff_family_score=diff_family_score,
        )

        soil_score = _clip(
            float(soil_weights["soil_health"]) * soil_health_score
            + float(soil_weights["erosion"]) * erosion_score
            + float(soil_weights["pest_break"]) * pest_break_score,
            0.0,
            100.0,
        )

        viable_share_by_crop: dict[str, float] = {}
        for cid in set(seq_ids):
            crop_seasons = [se for se in valid_seasons if se.crop_id == cid]
            viable_share_by_crop[cid] = (
                sum(1 for se in crop_seasons if se.viable) / len(crop_seasons) if crop_seasons else 0.0
            )
        annual_value, crop_values, market_missing = compute_crop_value(
            sequence_crops=seq_crops,
            market_crops=market_crops,
            viable_share_by_crop=viable_share_by_crop,
            cycle_months=cycle_months,
        )

        # Per-year overall scores for 10th and 90th percentile uncertainty bounds (Section 7 / 8.10)
        # Prefer years where all sequence crops have complete seasonal windows; fall back to
        # partial-sequence years only if zero complete-sequence years exist.
        full_years = [
            yr
            for yr in sorted_years
            if all(se.complete for se in seasons_by_year[yr])
        ]
        candidate_years = (
            full_years
            if full_years
            else [
                yr
                for yr in sorted_years
                if any(se.complete for se in seasons_by_year[yr])
            ]
        )

        # (year -> (water, resilience)); overall is combined after income is known for every rotation.
        yearly_parts: dict[int, tuple[float, float]] = {}
        for yr in candidate_years:
            yr_valid = [se for se in seasons_by_year[yr] if se.complete]
            yr_resilience = 100.0 * float(
                np.mean([1.0 if se.viable else 0.0 for se in yr_valid])
            )
            yr_deficit = float(
                np.mean(
                    [
                        float(se.water_deficit_mm)
                        for se in yr_valid
                        if se.water_deficit_mm is not None
                    ]
                )
            )
            yr_water = 100.0 * (
                1.0 - _clip(yr_deficit / water_gap_ref_mm, 0.0, 1.0)
            )
            yearly_parts[yr] = (yr_water, yr_resilience)
        yearly_parts_by_rot[rot_id] = yearly_parts

        # Per-crop water figures (average over past seasons) for the farm-level water numbers.
        need_by_crop: dict[str, float] = {}
        gap_by_crop: dict[str, float] = {}
        min_irrig_by_crop: dict[str, float] = {}
        for cid in dict.fromkeys(seq_ids):
            cs = [se for se in valid_seasons if se.crop_id == cid and se.effective_rain_mm is not None]
            if not cs:
                continue
            need_by_crop[cid] = float(np.mean([se.water_need_mm for se in cs]))
            gap_by_crop[cid] = float(np.mean([
                max(0.0, se.water_need_mm - float(se.effective_rain_mm) - se.soil_water_mm) for se in cs
            ]))
            min_irrig_by_crop[cid] = float(np.mean([
                max(0.0, se.viable_water_fraction * se.water_need_mm - float(se.effective_rain_mm) - se.soil_water_mm)
                for se in cs
            ]))
        cycle_years = max(cycle_months, 12) / 12.0
        if all(cid in need_by_crop for cid in seq_ids):
            mean_need_year: float | None = round(sum(need_by_crop[c] for c in seq_ids) / cycle_years, 1)
            mean_gap_year: float | None = round(sum(gap_by_crop[c] for c in seq_ids) / cycle_years, 1)
        else:
            mean_need_year = mean_gap_year = None

        failures, income_unchecked = _check_constraints(
            constraints=constraints,
            seq_crops=seq_crops,
            cover_crop=cover_crop,
            min_irrig_by_crop=min_irrig_by_crop,
            annual_value=annual_value,
            viable_count=sum(1 for se in valid_seasons if se.viable),
            evaluated_count=len(valid_seasons),
            parameters=parameters,
        )

        fy = build_farm_year(
            sequence_crops=seq_crops,
            cover_crop=cover_crop,
            region_id=field.region_id,
            monthly=profile.monthly,
            scenario=validated_scenario,
            heat_buckets_c=heat_buckets_c,
            parameters=parameters,
            water_available_mm=water_available,
            ndvi_monthly_mean=ndvi_curve,
        )

        viable_count = sum(1 for se in valid_seasons if se.viable)
        heat_fail_count = sum(1 for se in valid_seasons if se.heat_ok is False)
        frost_fail_count = sum(1 for se in valid_seasons if se.frost_ok is False)
        water_fail_count = sum(1 for se in valid_seasons if se.water_ok is False)

        unranked_evals.append(
            RotationEvaluation(
                rotation_id=rot_id,
                label=str(rot["label"]),
                strategy_type=str(rot["strategy_type"]),
                is_existing=is_existing,
                sequence_crop_ids=tuple(seq_ids),
                cover_crop_id=cover_id,
                scores={
                    "water": round(water_score, 2),
                    "soil": round(soil_score, 2),
                    "resilience": round(resilience_score, 2),
                },
                soil_subscores={
                    "soil_health": round(soil_health_score, 2),
                    "erosion": round(erosion_score, 2),
                    "pest_break": round(pest_break_score, 2),
                },
                overall=0.0,  # combined in the second pass below
                overall_low=0.0,
                overall_high=0.0,
                annual_overalls={},
                rank=0,  # Assigned deterministically below
                confidence=coverage_report.confidence,
                season_evaluations=tuple(season_evals),
                evaluated_seasons_count=len(valid_seasons),
                viable_seasons_count=viable_count,
                heat_failure_count=heat_fail_count,
                frost_failure_count=frost_fail_count,
                water_failure_count=water_fail_count,
                incomplete_season_count=len(incomplete_non_boundary),
                mean_water_deficit_mm=round(mean_deficit_mm, 2),
                mean_season_rain_mm=round(mean_rain_mm, 2),
                irrigation_mm=irrigation_mm,
                living_root_share=round(living_roots, 4),
                total_n_fix_kg_ha=round(total_n_fix, 2),
                bare_fraction=round(bare_fraction, 4),
                bare_fraction_source=bare_source,
                calendar_bare_fraction=round(cal_bare_with_cover, 4),
                calendar_bare_fraction_without_cover=round(cal_bare_no_cover, 4),
                cycle_months=cycle_months,
                slope_deg_used=slope_deg_val,
                heavy_rain_days_used=heavy_rain_val,
                annual_value_usd_ha=None if annual_value is None else round(annual_value, 0),
                crop_value_usd_ha={k: round(v, 0) for k, v in crop_values.items()},
                market_missing=tuple(market_missing),
                income_scored=False,
                mean_water_demand_mm=round(float(np.mean(demands)), 1),
                mean_effective_rain_mm=round(float(np.mean(eff_rains)), 1) if eff_rains else 0.0,
                soil_water_mm=round(float(np.mean([se.soil_water_mm for se in valid_seasons])), 1),
                water_demand_source=demand_sources.pop() if len(demand_sources) == 1 else "mixed",
                soil_awc_m3m3=soil_awc,
                fits_constraints=not failures,
                constraint_failures=tuple(failures),
                income_unchecked=income_unchecked,
                farm_year=fy.months,
                farm_year_result=fy,
                mean_water_need_mm=mean_need_year,
                mean_irrigation_gap_mm=mean_gap_year,
            )
        )

    # Second pass: income is relative (best-earning candidate = 100), so it needs every rotation.
    # It is scored only when every candidate has current FAOSTAT yield and price; otherwise its
    # weight is shared proportionally over water, soil and resilience.
    values = [ev.annual_value_usd_ha for ev in unranked_evals]
    income_ok = bool(values) and all(v is not None for v in values) and max(values) > 0  # type: ignore[type-var]
    p = validated_priorities
    if income_ok:
        w = {"water": p.w_water, "soil": p.w_soil, "income": p.w_income, "resilience": p.w_resilience}
    else:
        rest = p.w_water + p.w_soil + p.w_resilience
        if rest <= 0:
            w = {"water": 1 / 3, "soil": 1 / 3, "income": 0.0, "resilience": 1 / 3}
        else:
            w = {"water": p.w_water / rest, "soil": p.w_soil / rest, "income": 0.0, "resilience": p.w_resilience / rest}
    max_value = max(values) if income_ok else None  # type: ignore[type-var]

    finalized: list[RotationEvaluation] = []
    for ev in unranked_evals:
        scores = dict(ev.scores)
        income = None
        if income_ok and max_value:
            income = round(100.0 * float(ev.annual_value_usd_ha) / float(max_value), 2)  # type: ignore[arg-type]
            scores["income"] = income
        overall = _clip(
            w["water"] * scores["water"] + w["soil"] * scores["soil"]
            + w["resilience"] * scores["resilience"] + w["income"] * (income or 0.0),
            0.0, 100.0,
        )
        annual = {
            yr: round(_clip(
                w["water"] * yw + w["soil"] * scores["soil"] + w["resilience"] * yres + w["income"] * (income or 0.0),
                0.0, 100.0), 2)
            for yr, (yw, yres) in yearly_parts_by_rot[ev.rotation_id].items()
        }
        arr = np.array(list(annual.values()), dtype=float)
        finalized.append(
            RotationEvaluation(**{
                **ev.__dict__,
                "scores": scores,
                "overall": round(overall, 2),
                # Exact 10th and 90th percentiles of the per-year overall, never clamped to the mean
                "overall_low": round(float(np.percentile(arr, 10)), 2),
                "overall_high": round(float(np.percentile(arr, 90)), 2),
                "annual_overalls": annual,
                "income_scored": income_ok,
            })
        )
    unranked_evals = finalized

    # Deterministic ranking:
    # 1. Descending overall score
    # 2. Existing rotation preferred on exact tie
    # 3. Descending resilience score
    # 4. Ascending rotation_id
    sorted_evals = sorted(
        unranked_evals,
        key=lambda ev: (
            -ev.overall,
            0 if ev.is_existing else 1,
            -ev.scores["resilience"],
            ev.rotation_id,
        ),
    )

    ranked = [RotationEvaluation(**{**ev.__dict__, "rank": idx + 1}) for idx, ev in enumerate(sorted_evals)]
    reasons = shortlist_reasons(ranked)
    ranked_evals = tuple(
        RotationEvaluation(**{
            **ev.__dict__,
            "shortlisted": ev.rotation_id in reasons,
            "shortlist_reason": reasons.get(ev.rotation_id),
        })
        for ev in ranked
    )

    scenario_applied = bool(
        abs(validated_scenario.rain_multiplier - 1.0) > 1e-9
        or abs(validated_scenario.temp_delta_c - 0.0) > 1e-9
    )

    return EngineComparisonResult(
        field_id=field.field_id,
        scenario_applied=scenario_applied,
        evaluations=ranked_evals,
        coverage_report=coverage_report,
        constraints=constraints,
        total_candidates=len(ranked_evals),
    )


def shortlist_reasons(ranked: list[RotationEvaluation]) -> dict[str, str]:
    """Deterministic shortlist (module docstring rule 11): rotation_id -> plain reason."""
    reasons: dict[str, str] = {}
    by_rank = sorted(ranked, key=lambda e: (e.rank, e.rotation_id))
    for ev in by_rank:
        if ev.is_existing:
            reasons[ev.rotation_id] = CURRENT_REASON
    for strategy, reason in SHORTLIST_ORDER:
        best = next(
            (
                ev for ev in by_rank
                if ev.strategy_type == strategy and ev.fits_constraints and ev.rotation_id not in reasons
            ),
            None,
        )
        if best is not None:
            reasons[best.rotation_id] = reason
    return reasons


def crop_equipment_needs(crop: dict[str, Any], parameters: dict[str, Any]) -> list[str]:
    """Equipment/labour/commitments a crop usually needs (`parameters.json` `equipment_needs`)."""
    cfg = parameters.get("equipment_needs") or {}
    by_crop = cfg.get("by_crop") or {}
    cid = str(crop.get("crop_id"))
    if cid in by_crop:
        return list(by_crop[cid] or [])
    return list((cfg.get("by_type") or {}).get(str(crop.get("type")), []) or [])


def _fmt_count(x: float) -> str:
    return f"{x:.0f}" if abs(x - round(x)) < 0.05 else f"{x:.1f}"


def _check_constraints(
    *,
    constraints: FarmConstraints | None,
    seq_crops: list[dict[str, Any]],
    cover_crop: dict[str, Any] | None,
    min_irrig_by_crop: dict[str, float],
    annual_value: float | None,
    viable_count: int,
    evaluated_count: int,
    parameters: dict[str, Any],
) -> tuple[list[tuple[str, str]], bool]:
    """Return `([(kind, plain sentence), ...], income_unchecked)` for the farmer's limits."""
    if constraints is None:
        return [], False
    out: list[tuple[str, str]] = []

    if constraints.water_available_mm is not None:
        have = float(constraints.water_available_mm)
        unique = {str(c["crop_id"]): c for c in seq_crops}
        short = [
            (str(c.get("name", cid)), min_irrig_by_crop[cid])
            for cid, c in unique.items()
            if cid in min_irrig_by_crop and min_irrig_by_crop[cid] > have
        ]
        if short:
            name, need = max(short, key=lambda x: (x[1], x[0]))
            out.append((
                "water",
                f"{name} needs about {round(need, -1):,.0f} mm of irrigation per season to get through a "
                f"normal year; you said you have {have:,.0f} mm.",
            ))

    income_unchecked = False
    if constraints.min_income_usd_ha is not None:
        target = float(constraints.min_income_usd_ha)
        if annual_value is None:
            income_unchecked = True
        elif annual_value < target:
            out.append((
                "income",
                f"Expected crop sales are about ${annual_value:,.0f} per hectare a year; "
                f"your target is ${target:,.0f}.",
            ))

    if constraints.max_bad_seasons_in_10 is not None and evaluated_count > 0:
        bad_in_10 = (evaluated_count - viable_count) / evaluated_count * 10.0
        if bad_in_10 > constraints.max_bad_seasons_in_10 + 1e-9:
            out.append((
                "risk",
                f"About {_fmt_count(bad_in_10)} of every 10 past seasons failed here; "
                f"you said you can accept {constraints.max_bad_seasons_in_10}.",
            ))

    if constraints.unavailable_equipment:
        crops = list(seq_crops) + ([cover_crop] if cover_crop is not None else [])
        for item in dict.fromkeys(constraints.unavailable_equipment):
            names = list(dict.fromkeys(
                str(c.get("name", c["crop_id"])) for c in crops if item in crop_equipment_needs(c, parameters)
            ))
            if not names:
                continue
            who = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]
            verb = "needs" if len(names) == 1 else "need"
            out.append((
                "equipment",
                f"{who} {verb} {EQUIPMENT_LABELS.get(item, item.replace('_', ' '))}, which you said you do not have.",
            ))
    return out, income_unchecked
