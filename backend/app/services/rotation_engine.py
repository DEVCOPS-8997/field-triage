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
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy as np

from app.models.schemas import (
    FieldInfo,
    FieldProfile,
    MonthRecord,
    Priorities,
    Quality,
    Scenario,
)
from app.services.data_loader import FIVE_CONFIDENCE_PILLARS, PILLAR_TO_METADATA_ID
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
BareFractionSource = Literal["modis_ndvi", "crop_calendar"]


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
    season_heat_days: int | None
    max_heat_days_tolerated: int
    season_frost_days: int | None
    frost_sensitive: bool
    heat_ok: bool | None
    frost_ok: bool | None
    water_ok: bool | None
    viable: bool | None


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
    mean_om_effect: float
    total_n_fix_kg_ha: float
    bare_fraction: float
    bare_fraction_source: BareFractionSource
    calendar_bare_fraction: float
    calendar_bare_fraction_without_cover: float
    cycle_months: int
    slope_deg_used: float | None
    heavy_rain_days_used: float | None
    mean_market_score: float
    market_access_used: int | None


@dataclass(frozen=True)
class EngineComparisonResult:
    """Top-level pure mathematical output consumed by `explain.py` and API routes."""

    field_id: str
    scenario_applied: bool
    evaluations: tuple[RotationEvaluation, ...]
    coverage_report: PillarCoverageReport


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


def _earliest_month_ge(min_abs_month: int, target_calendar_month: int) -> int:
    """Return smallest 1-based absolute month `>= min_abs_month` matching `target_calendar_month` (1..12)."""
    current_cal_month = ((min_abs_month - 1) % 12) + 1
    offset = (target_calendar_month - current_cal_month) % 12
    return min_abs_month + offset


def _crop_end_abs_month(start_abs_month: int, sow_month: int, harvest_month: int) -> int:
    """Return inclusive ending 1-based absolute month for a crop starting at `start_abs_month`."""
    duration_span = (
        (harvest_month - sow_month)
        if sow_month <= harvest_month
        else (12 - sow_month + harvest_month)
    )
    return start_abs_month + duration_span


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
    calendars = [validate_crop_calendar(c, region_id) for c in sequence_crops]
    first_sow, first_harv = calendars[0]

    starts: list[int] = [first_sow]
    ends: list[int] = [_crop_end_abs_month(first_sow, first_sow, first_harv)]

    for sow_m, harv_m in calendars[1:]:
        next_start = _earliest_month_ge(ends[-1], sow_m)
        if next_start <= starts[-1]:
            next_start += 12
        starts.append(next_start)
        ends.append(_crop_end_abs_month(next_start, sow_m, harv_m))

    cycle_end_sow = _earliest_month_ge(max(ends[-1], starts[0] + 1), first_sow)
    if cycle_end_sow <= starts[0]:
        cycle_end_sow += 12

    cycle_months = cycle_end_sow - starts[0]
    cash_covered: set[int] = set()
    for st, en in zip(starts, ends, strict=True):
        for abs_m in range(st, en + 1):
            cash_covered.add((abs_m - starts[0]) % cycle_months)

    bare_without_cover = _clip(1.0 - (len(cash_covered) / float(cycle_months)), 0.0, 1.0)

    if cover_crop is None:
        return bare_without_cover, bare_without_cover, cycle_months

    cover_sow, cover_harv = validate_crop_calendar(cover_crop, region_id)
    with_cover_set = set(cash_covered)

    for idx, end_curr in enumerate(ends):
        next_cash_start = starts[idx + 1] if idx + 1 < len(starts) else cycle_end_sow
        if next_cash_start - end_curr <= 1:
            continue
        c_start = _earliest_month_ge(end_curr, cover_sow)
        c_end = _crop_end_abs_month(c_start, cover_sow, cover_harv)
        while c_end <= next_cash_start:
            for abs_m in range(c_start, c_end + 1):
                with_cover_set.add((abs_m - starts[0]) % cycle_months)
            c_start += 12
            c_end += 12

    bare_with_cover = _clip(1.0 - (len(with_cover_set) / float(cycle_months)), 0.0, 1.0)
    return bare_with_cover, bare_without_cover, cycle_months


def compute_soil_health_score(
    sequence_crops: list[dict[str, Any]],
    cover_crop: dict[str, Any] | None,
    n_ref_kg_ha: float,
) -> tuple[float, float, float]:
    """Compute `(soil_health_score, mean_om_effect, total_n_fix_kg_ha)` per Section 7 & 8.7."""
    soil_crops = list(sequence_crops)
    if cover_crop is not None:
        soil_crops.append(cover_crop)

    om_values = [float(c["om_effect"]) for c in soil_crops]
    n_fix_values = [float(c["n_fix_kg_ha"]) for c in soil_crops]

    mean_om = float(np.mean(om_values))
    total_n_fix = float(np.sum(n_fix_values))

    om_term = 0.7 * ((mean_om + 1.0) / 3.0)
    n_term = 0.3 * _clip(total_n_fix / float(n_ref_kg_ha), 0.0, 1.0)
    score = 100.0 * _clip(om_term + n_term, 0.0, 1.0)
    return score, mean_om, total_n_fix


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


def compute_income_score(
    sequence_crops: list[dict[str, Any]],
    market_access: int | None,
) -> tuple[float, float, int | None]:
    """Compute `(income_score, mean_market_score, market_access_used)` over harvested cash crops."""
    market_scores = [float(c["market_score"]) for c in sequence_crops]
    mean_market = float(np.mean(market_scores))

    if is_valid_number(market_access):
        access_val = int(market_access)  # type: ignore[arg-type]
        access_scale = _clip(float(access_val) / 5.0, 0.0, 1.0)
        return _clip(20.0 * mean_market * access_scale, 0.0, 100.0), mean_market, access_val

    # Neutral midpoint scaling (3/5) when optional FieldInfo.market_access is None
    return _clip(20.0 * mean_market * 0.6, 0.0, 100.0), mean_market, None


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
        for yr in range(years_span[0], years_span[-1] + 1):
            for mo in range(1, 13):
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
) -> SeasonEvaluation:
    sow_month, harvest_month = validate_crop_calendar(crop, region_id)
    window = get_season_year_months(sow_year, sow_month, harvest_month)
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
        )

    raw_rain_sum = sum(float(r.rain_mm) for r in window_records if r.rain_mm is not None)
    season_rain_mm = raw_rain_sum * float(scenario.rain_multiplier)
    water_deficit_mm = max(0.0, water_need_mm - season_rain_mm - irrigation_mm)
    season_heat_days = sum(int(r.heat_days_ge[bucket_key]) for r in window_records)

    if all(is_valid_number(r.frost_days_le_0c) for r in window_records):
        season_frost_days: int | None = sum(
            int(r.frost_days_le_0c)
            for r in window_records
            if r.frost_days_le_0c is not None
        )
    else:
        season_frost_days = None

    heat_ok = season_heat_days <= max_heat_tol
    frost_ok = not (
        frost_sensitive and season_frost_days is not None and season_frost_days > 0
    )
    water_ok = (season_rain_mm + irrigation_mm) >= (viable_water_fraction * water_need_mm)
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
        water_need_mm=water_need_mm,
        water_deficit_mm=water_deficit_mm,
        heat_bucket_key=bucket_key,
        season_heat_days=season_heat_days,
        max_heat_days_tolerated=max_heat_tol,
        season_frost_days=season_frost_days,
        frost_sensitive=frost_sensitive,
        heat_ok=heat_ok,
        frost_ok=frost_ok,
        water_ok=water_ok,
        viable=viable,
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
) -> EngineComparisonResult:
    """Evaluate, score, quantify uncertainty/confidence, and rank candidate rotations for `field`."""
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

    irrigation_mm = float(parameters["irrigation_mm"][field.irrigation])
    viable_water_fraction = float(parameters["viable_water_fraction"])
    water_gap_ref_mm = float(parameters["water_gap_ref_mm"])
    n_ref_kg_ha = float(parameters["n_ref_kg_ha"])
    heavy_ref_days = float(parameters["heavy_ref_days"])
    heat_buckets_c = list(parameters["heat_buckets_c"])
    soil_weights = parameters["soil_weights"]
    same_family_score = float(parameters["pest_break_same_family"])
    diff_family_score = float(parameters["pest_break_diff_family"])

    slope_deg_raw = profile.terrain.get("slope_deg")
    slope_deg_val = float(slope_deg_raw) if is_valid_number(slope_deg_raw) else None

    heavy_rain_raw = profile.climatology.get("heavy_rain_days_ge_25mm_mean")
    heavy_rain_val = float(heavy_rain_raw) if is_valid_number(heavy_rain_raw) else None

    bare_days_raw = profile.climatology.get("bare_days_est_mean")
    bare_days_modis = float(bare_days_raw) if is_valid_number(bare_days_raw) else None

    coverage_report = assess_coverage_and_confidence(profile, parameters)

    unranked_evals: list[RotationEvaluation] = []

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
                    viable_water_fraction=viable_water_fraction,
                    heat_buckets_c=heat_buckets_c,
                    scenario=validated_scenario,
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

        resilience_score = _clip(100.0 * float(np.mean(viable_flags)), 0.0, 100.0)
        mean_deficit_mm = float(np.mean(water_deficits))
        mean_rain_mm = float(np.mean(season_rains))
        water_score = _clip(
            100.0 * (1.0 - _clip(mean_deficit_mm / water_gap_ref_mm, 0.0, 1.0)),
            0.0,
            100.0,
        )

        # Soil components: soil_health, erosion, pest_break
        soil_health_score, mean_om, total_n_fix = compute_soil_health_score(
            sequence_crops=seq_crops,
            cover_crop=cover_crop,
            n_ref_kg_ha=n_ref_kg_ha,
        )

        cal_bare_with_cover, cal_bare_no_cover, cycle_months = (
            compute_calendar_bare_fraction(
                sequence_crops=seq_crops,
                cover_crop=cover_crop,
                region_id=field.region_id,
            )
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

        income_score, mean_market, access_used = compute_income_score(
            sequence_crops=seq_crops,
            market_access=field.market_access,
        )

        overall_score = _clip(
            validated_priorities.w_water * water_score
            + validated_priorities.w_soil * soil_score
            + validated_priorities.w_income * income_score
            + validated_priorities.w_resilience * resilience_score,
            0.0,
            100.0,
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

        annual_overalls: dict[int, float] = {}
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
            yr_overall = (
                validated_priorities.w_water * yr_water
                + validated_priorities.w_soil * soil_score
                + validated_priorities.w_income * income_score
                + validated_priorities.w_resilience * yr_resilience
            )
            annual_overalls[yr] = round(_clip(yr_overall, 0.0, 100.0), 2)

        annual_values = np.array(list(annual_overalls.values()), dtype=float)
        # Exact mathematical 10th and 90th percentiles — never clamped to include the mean
        overall_low = round(float(np.percentile(annual_values, 10)), 2)
        overall_high = round(float(np.percentile(annual_values, 90)), 2)

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
                    "income": round(income_score, 2),
                },
                soil_subscores={
                    "soil_health": round(soil_health_score, 2),
                    "erosion": round(erosion_score, 2),
                    "pest_break": round(pest_break_score, 2),
                },
                overall=round(overall_score, 2),
                overall_low=overall_low,
                overall_high=overall_high,
                annual_overalls=annual_overalls,
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
                mean_om_effect=round(mean_om, 3),
                total_n_fix_kg_ha=round(total_n_fix, 2),
                bare_fraction=round(bare_fraction, 4),
                bare_fraction_source=bare_source,
                calendar_bare_fraction=round(cal_bare_with_cover, 4),
                calendar_bare_fraction_without_cover=round(cal_bare_no_cover, 4),
                cycle_months=cycle_months,
                slope_deg_used=slope_deg_val,
                heavy_rain_days_used=heavy_rain_val,
                mean_market_score=round(mean_market, 2),
                market_access_used=access_used,
            )
        )

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

    ranked_evals = tuple(
        RotationEvaluation(
            **{
                **ev.__dict__,
                "rank": idx + 1,
            }
        )
        for idx, ev in enumerate(sorted_evals)
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
    )
