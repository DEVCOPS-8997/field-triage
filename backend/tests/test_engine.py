"""Comprehensive mathematical unit tests for `rotation_engine.py` (Execution Plan Section 7)."""

from __future__ import annotations

import copy
import math
from typing import Any

import numpy as np
import pytest

from app.models.schemas import FieldInfo, FieldProfile, MonthRecord, Priorities, Scenario
from app.services.rotation_engine import (
    assess_coverage_and_confidence,
    compute_calendar_bare_fraction,
    compute_erosion_score,
    compute_income_score,
    compute_pest_break_score,
    compute_soil_health_score,
    evaluate_rotations,
    get_season_year_months,
    select_heat_bucket,
)
from app.utils.validation import ProfileUnavailableError, RequestValidationError
from tests.conftest import make_synthetic_profile_dict


def test_same_year_and_cross_year_winter_calendars() -> None:
    """Verify same-year (May-Nov) vs cross-year winter (Nov y -> Apr y+1) month windows."""
    # Cotton in pk_punjab: May..Nov in year 2020
    cotton_win = get_season_year_months(2020, 5, 11)
    assert cotton_win == [(2020, m) for m in range(5, 12)]

    # Wheat in pk_punjab: Nov..Dec 2020 + Jan..Apr 2021 (never Jan..Apr 2020)
    wheat_win = get_season_year_months(2020, 11, 4)
    assert wheat_win == [
        (2020, 11),
        (2020, 12),
        (2021, 1),
        (2021, 2),
        (2021, 3),
        (2021, 4),
    ]


def test_cross_year_winter_season_sums_across_adjacent_years(real_catalog: Any) -> None:
    """Prove Nov-Apr winter crop sums year y (Nov-Dec) + year y+1 (Jan-Apr), not single-year."""
    f01: FieldInfo = real_catalog.fields_by_id["F01"]

    # Give 2020 Jan-Apr huge rainfall (999 mm) and 2021 Jan-Apr modest rainfall (50 mm/mo).
    # A buggy single-year engine would read 2020 Jan-Apr; correct cross-year reads 2021 Jan-Apr.
    monthly: list[MonthRecord] = []
    for yr in (2020, 2021):
        for mo in range(1, 13):
            if yr == 2020 and mo in (1, 2, 3, 4):
                rain = 300.0
            elif yr == 2020 and mo in (11, 12):
                rain = 25.0
            elif yr == 2021 and mo in (1, 2, 3, 4):
                rain = 50.0
            else:
                rain = 60.0
            monthly.append(
                MonthRecord(
                    year=yr,
                    month=mo,
                    rain_mm=rain,
                    tmean_c=22.0,
                    tmax_mean_c=29.0,
                    tmin_mean_c=15.0,
                    heat_days_ge={"30": 1, "34": 0, "38": 0, "42": 0},
                    frost_days_le_0c=0,
                )
            )

    prof_dict = make_synthetic_profile_dict(field_id="F01", region_id="pk_punjab", data_mode="demo")
    prof_dict["monthly"] = [m.model_dump() for m in monthly]
    prof_dict["n_years"] = 2
    profile = FieldProfile.model_validate(prof_dict)

    res = evaluate_rotations(
        field=f01,
        profile=profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
    )
    existing = next(ev for ev in res.evaluations if ev.rotation_id == "rot_pk_cotton_wheat")
    wheat_2020 = next(
        se for se in existing.season_evaluations if se.crop_id == "wheat" and se.year == 2020
    )
    assert wheat_2020.complete is True
    # Nov-Dec 2020 (25 + 25 = 50) + Jan-Apr 2021 (50 * 4 = 200) = 250.0 mm
    assert math.isclose(wheat_2020.season_rain_mm or 0.0, 250.0)

    # Trailing wheat season starting Nov 2021 has no Jan-Apr 2022 -> incomplete boundary, not counted in incomplete_season_count
    wheat_2021 = next(
        se for se in existing.season_evaluations if se.crop_id == "wheat" and se.year == 2021
    )
    assert wheat_2021.complete is False
    assert wheat_2021.is_trailing_cross_year_boundary is True
    assert existing.incomplete_season_count == 0


def test_missing_historical_months_are_never_coerced_to_zero(real_catalog: Any) -> None:
    """Verify missing `rain_mm` excludes incomplete season rather than treating null as 0 mm."""
    f01: FieldInfo = real_catalog.fields_by_id["F01"]
    prof_dict = make_synthetic_profile_dict(
        field_id="F01", region_id="pk_punjab", data_mode="demo", n_years=4, start_year=2018
    )
    # Null out July 2019 rainfall
    for rec in prof_dict["monthly"]:
        if rec["year"] == 2019 and rec["month"] == 7:
            rec["rain_mm"] = None

    profile = FieldProfile.model_validate(prof_dict)
    res = evaluate_rotations(
        field=f01,
        profile=profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
    )
    assert res.coverage_report.missing_climate_months == 1

    existing = next(ev for ev in res.evaluations if ev.is_existing)
    cotton_2019 = next(
        se for se in existing.season_evaluations if se.crop_id == "cotton" and se.year == 2019
    )
    assert cotton_2019.complete is False
    assert cotton_2019.season_rain_mm is None
    assert cotton_2019.viable is None
    assert (2019, 7) in cotton_2019.missing_months
    assert existing.incomplete_season_count == 1


def test_heat_bucket_selection_and_temperature_scenario_shift() -> None:
    """Verify nearest string bucket selection and conservative lower-bucket tie-breaking."""
    buckets = [30, 34, 38, 42]
    assert select_heat_bucket(38, 0.0, buckets) == "38"
    assert select_heat_bucket(38, 1.0, buckets) == "38"  # 37 -> nearest is 38 (dist 1 vs 3)
    assert select_heat_bucket(38, 2.0, buckets) == "34"  # 36 -> equidistant 34 & 38 -> lower "34"
    assert select_heat_bucket(34, 3.5, buckets) == "30"  # 30.5 -> "30"
    assert select_heat_bucket(42, 4.0, buckets) == "38"


def test_irrigation_frost_and_viability_exact_formulas(real_catalog: Any) -> None:
    """Test viability conditions (heat, frost sensitivity, 60% water) and externalized irrigation."""
    f01 = real_catalog.fields_by_id["F01"]  # limited irrigation -> 150 mm by default
    prof_dict = make_synthetic_profile_dict(
        field_id="F01", region_id="pk_punjab", data_mode="demo", n_years=2, start_year=2020
    )
    # Set uniform controlled monthly values:
    # Cotton (May-Nov, 7 months): water_need=800 -> 0.6*800 = 480 mm required.
    # With rain=50 mm/mo -> 350 mm rain + 150 mm limited irrigation = 500 mm >= 480 -> viable!
    # Wheat (Nov-Apr, 6 months): frost_sensitive=False, water_need=450 -> 0.6*450 = 270 mm.
    # Give Dec 2020 frost_days=4: wheat (frost_sensitive=False) stays viable!
    for rec in prof_dict["monthly"]:
        rec["rain_mm"] = 50.0
        rec["heat_days_ge"] = {"30": 4, "34": 1, "38": 2, "42": 0}
        rec["frost_days_le_0c"] = 4 if rec["month"] == 12 else 0

    profile = FieldProfile.model_validate(prof_dict)
    res_base = evaluate_rotations(
        field=f01,
        profile=profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
    )
    cot_wheat = next(ev for ev in res_base.evaluations if ev.rotation_id == "rot_pk_cotton_wheat")
    assert cot_wheat.scores["resilience"] == 100.0

    # Now modify parameters["irrigation_mm"]["limited"] dynamically from 150 -> 50:
    # Cotton gets 350 + 50 = 400 < 480 -> cotton fails water viability in both years!
    # Wheat (2020-2021) gets 300 + 50 = 350 >= 270 -> wheat remains viable despite frost_days=4!
    custom_params = copy.deepcopy(real_catalog.parameters)
    custom_params["irrigation_mm"]["limited"] = 50
    res_low_irrig = evaluate_rotations(
        field=f01,
        profile=profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=custom_params,
    )
    cot_wheat_low = next(
        ev for ev in res_low_irrig.evaluations if ev.rotation_id == "rot_pk_cotton_wheat"
    )
    # Evaluated seasons: cotton 2020 (fail), wheat 2020 (viable), cotton 2021 (fail) -> 1/3 = 33.33
    assert cot_wheat_low.water_failure_count == 2
    assert cot_wheat_low.frost_failure_count == 0
    assert math.isclose(cot_wheat_low.scores["resilience"], 33.33, abs_tol=0.02)

    # Frost check on frost-sensitive maize (sow 2..6 in pk_punjab), stage-aware:
    # frost in the sowing month (Feb, initial stage) does not fail the season...
    prof_sow_frost = copy.deepcopy(prof_dict)
    for rec in prof_sow_frost["monthly"]:
        if rec["month"] == 2:
            rec["frost_days_le_0c"] = 2
    res_sow_frost = evaluate_rotations(
        field=f01,
        profile=FieldProfile.model_validate(prof_sow_frost),
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
    )
    assert next(
        ev for ev in res_sow_frost.evaluations if ev.rotation_id == "rot_pk_maize_wheat"
    ).frost_failure_count == 0
    # ...but frost in April (development / mid-season) does.
    prof_frost = copy.deepcopy(prof_dict)
    for rec in prof_frost["monthly"]:
        if rec["month"] == 4:
            rec["frost_days_le_0c"] = 2
    res_frost = evaluate_rotations(
        field=f01,
        profile=FieldProfile.model_validate(prof_frost),
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
    )
    maize_wheat = next(
        ev for ev in res_frost.evaluations if ev.rotation_id == "rot_pk_maize_wheat"
    )
    assert maize_wheat.frost_failure_count == 2


def test_component_equations_soil_erosion_pest_and_income(real_catalog: Any) -> None:
    """Hand-verify Section 7 equations for soil_health, erosion, pest_break, and income."""
    crops = real_catalog.crops_by_id

    # 1. Soil health: Sorghum (om=1, n=0) + Chickpea (om=1, n=50), n_ref=100
    # mean_om = 1.0 -> 0.7 * (1+1)/3 = 1.4/3 = 0.4666667
    # n_term = 0.3 * (50/100) = 0.15 -> sum = 0.6166667 -> 61.6667
    sh, mean_om, total_n = compute_soil_health_score(
        [crops["sorghum"], crops["chickpea"]], None, n_ref_kg_ha=100.0
    )
    assert math.isclose(mean_om, 1.0)
    assert math.isclose(total_n, 50.0)
    assert math.isclose(sh, 100.0 * (0.7 * (2.0 / 3.0) + 0.15), rel_tol=1e-6)

    # 2. Pest break:
    # Same family: maize (poaceae) -> wheat (poaceae) => 20.0
    assert compute_pest_break_score([crops["maize"], crops["wheat"]], 20.0, 100.0) == 20.0
    # Different family: maize (poaceae) -> soybean (fabaceae) => 100.0
    assert compute_pest_break_score([crops["maize"], crops["soybean"]], 20.0, 100.0) == 100.0
    # 3-crop cyclic: maize (poaceae) -> soybean (fabaceae) -> wheat (poaceae) -> (100+100+20)/3 = 73.3333
    pb3 = compute_pest_break_score(
        [crops["maize"], crops["soybean"], crops["wheat"]], 20.0, 100.0
    )
    assert math.isclose(pb3, 220.0 / 3.0, rel_tol=1e-6)

    # 3. Erosion: bare_fraction=0.5, slope_deg=2.0 (-> 1.2), heavy_rain=1.5/3.0=0.5
    # risk = 0.5 * 1.2 * 0.5 = 0.30 -> score = 70.0
    er = compute_erosion_score(0.5, slope_deg=2.0, heavy_rain_days_mean=1.5, heavy_ref_days=3.0)
    assert math.isclose(er, 70.0, rel_tol=1e-6)

    # Missing slope_deg=None leaves slope_factor=1.0; heavy_rain=0.1 clips rain_factor to 0.2:
    # risk = 0.5 * 1.0 * 0.2 = 0.10 -> score = 90.0
    er_null = compute_erosion_score(0.5, slope_deg=None, heavy_rain_days_mean=0.1, heavy_ref_days=3.0)
    assert math.isclose(er_null, 90.0, rel_tol=1e-6)

    # 4. Income: Corn-Soy (market_score 4 & 4 -> mean 4.0), market_access=5 -> 20 * 4 * (5/5) = 80.0
    inc, mm, acc = compute_income_score([crops["maize"], crops["soybean"]], market_access=5)
    assert math.isclose(inc, 80.0)
    assert math.isclose(mm, 4.0)
    assert acc == 5


def test_cover_crop_improves_soil_and_erosion_without_distorting_cash_metrics(
    real_catalog: Any,
    f05_demo_profile: FieldProfile,
) -> None:
    """Verify `rot_us_corn_soy_rye` cover crop (`cereal_rye`) rules per Section 8.7."""
    f05: FieldInfo = real_catalog.fields_by_id["F05"]
    crops = real_catalog.crops_by_id

    bare_with, bare_without, cycle_m = compute_calendar_bare_fraction(
        [crops["maize"], crops["soybean"]], crops["cereal_rye"], "us_midwest"
    )
    assert cycle_m == 24
    assert math.isclose(bare_without, 0.5)
    assert math.isclose(bare_with, 0.0)

    # Compare rot_us_corn_soy vs rot_us_corn_soy_rye when MODIS bare_days_est_mean is unavailable
    # so both use calendar bare_fraction on identical cash crops:
    prof_dict = f05_demo_profile.model_dump()
    prof_dict["climatology"]["bare_days_est_mean"] = None
    profile = FieldProfile.model_validate(prof_dict)

    res = evaluate_rotations(
        field=f05,
        profile=profile,
        crops_by_id=crops,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
    )
    base = next(ev for ev in res.evaluations if ev.rotation_id == "rot_us_corn_soy")
    rye = next(ev for ev in res.evaluations if ev.rotation_id == "rot_us_corn_soy_rye")

    # Cover crop boosts soil_health (cereal_rye om_effect=2) and erosion (bare 0.5 -> 0.0)
    assert rye.soil_subscores["soil_health"] > base.soil_subscores["soil_health"]
    assert rye.soil_subscores["erosion"] > base.soil_subscores["erosion"]
    assert rye.scores["soil"] > base.scores["soil"]

    # Cash-crop metrics remain strictly identical (cereal_rye is NOT a commercial cash crop)
    assert rye.scores["income"] == base.scores["income"]
    assert rye.scores["water"] == base.scores["water"]
    assert rye.scores["resilience"] == base.scores["resilience"]
    assert rye.soil_subscores["pest_break"] == base.soil_subscores["pest_break"]


def test_is_existing_uses_current_rotation_id_not_strategy_type(
    real_catalog: Any,
    f01_demo_profile: FieldProfile,
) -> None:
    """Ensure `is_existing` is `rotation_id == field.current_rotation_id`, never `strategy_type == 'existing'`."""
    f01 = real_catalog.fields_by_id["F01"]  # current_rotation_id = rot_pk_cotton_wheat

    # Default candidate list now includes every regional rotation (other conventional systems too)
    default_res = evaluate_rotations(
        field=f01,
        profile=f01_demo_profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
    )
    default_ids = [ev.rotation_id for ev in default_res.evaluations]
    assert "rot_pk_cotton_wheat" in default_ids
    assert "rot_pk_rice_wheat" in default_ids
    assert next(ev for ev in default_res.evaluations if ev.rotation_id == "rot_pk_rice_wheat").is_existing is False
    assert sum(1 for ev in default_res.evaluations if ev.is_existing) == 1

    # Even if rot_pk_rice_wheat (`strategy_type == 'existing'`) is explicitly requested for F01,
    # its `is_existing` flag MUST be False, and F01's actual `rot_pk_cotton_wheat` is auto-included!
    custom_res = evaluate_rotations(
        field=f01,
        profile=f01_demo_profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
        requested_rotation_ids=[
            "rot_pk_rice_wheat",
            "rot_pk_sorghum_chickpea",
            "rot_pk_sorghum_berseem",
        ],
    )
    by_id = {ev.rotation_id: ev for ev in custom_res.evaluations}
    assert "rot_pk_cotton_wheat" in by_id
    assert by_id["rot_pk_cotton_wheat"].is_existing is True
    assert by_id["rot_pk_rice_wheat"].is_existing is False

    # Cross-region rotation rejected with RequestValidationError
    with pytest.raises(RequestValidationError):
        evaluate_rotations(
            field=f01,
            profile=f01_demo_profile,
            crops_by_id=real_catalog.crops_by_id,
            rotations=real_catalog.rotations,
            parameters=real_catalog.parameters,
            requested_rotation_ids=[
                "rot_pk_cotton_wheat",
                "rot_pk_sorghum_chickpea",
                "rot_us_corn_soy",
            ],
        )

    # Fewer than 3 candidates rejected
    with pytest.raises(RequestValidationError):
        evaluate_rotations(
            field=f01,
            profile=f01_demo_profile,
            crops_by_id=real_catalog.crops_by_id,
            rotations=real_catalog.rotations,
            parameters=real_catalog.parameters,
            requested_rotation_ids=["rot_pk_cotton_wheat", "rot_pk_sorghum_chickpea"],
        )


def test_priorities_scenario_ranking_ties_and_unclamped_percentiles(
    real_catalog: Any,
    f01_demo_profile: FieldProfile,
) -> None:
    """Test priority shifts, scenario sensitivity, deterministic tie-breaking, and exact p10/p90."""
    f01 = real_catalog.fields_by_id["F01"]

    water_focused = evaluate_rotations(
        field=f01,
        profile=f01_demo_profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
        priorities=Priorities(w_water=0.85, w_soil=0.05, w_income=0.05, w_resilience=0.05),
    )
    income_focused = evaluate_rotations(
        field=f01,
        profile=f01_demo_profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
        priorities=Priorities(w_water=0.05, w_soil=0.05, w_income=0.85, w_resilience=0.05),
    )
    assert water_focused.evaluations[0].rotation_id == "rot_pk_sorghum_chickpea"
    assert income_focused.evaluations[0].rotation_id != "rot_pk_sorghum_chickpea"

    # Drought + warming scenario lowers water/resilience scores relative to baseline
    stressed = evaluate_rotations(
        field=f01,
        profile=f01_demo_profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
        scenario=Scenario(rain_multiplier=0.6, temp_delta_c=3.0),
    )
    assert stressed.scenario_applied is True
    base_res = evaluate_rotations(
        field=f01,
        profile=f01_demo_profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
    )
    assert base_res.scenario_applied is False
    base_cw = next(e for e in base_res.evaluations if e.rotation_id == "rot_pk_cotton_wheat")
    stress_cw = next(e for e in stressed.evaluations if e.rotation_id == "rot_pk_cotton_wheat")
    assert stress_cw.overall < base_cw.overall

    # Deterministic tie-breaking: clone identical rotations where one is field.current_rotation_id
    tied_rotations = [
        {
            "rotation_id": "rot_pk_cotton_wheat",
            "label": "Current",
            "strategy_type": "existing",
            "region_id": "pk_punjab",
            "sequence": ["sorghum", "chickpea"],
            "cover_crop": None,
        },
        {
            "rotation_id": "rot_a_clone",
            "label": "Clone A",
            "strategy_type": "water_saving",
            "region_id": "pk_punjab",
            "sequence": ["sorghum", "chickpea"],
            "cover_crop": None,
        },
        {
            "rotation_id": "rot_b_clone",
            "label": "Clone B",
            "strategy_type": "soil_building",
            "region_id": "pk_punjab",
            "sequence": ["sorghum", "chickpea"],
            "cover_crop": None,
        },
    ]
    prof_no_modis = f01_demo_profile.model_dump()
    prof_no_modis["climatology"]["bare_days_est_mean"] = None
    tie_res = evaluate_rotations(
        field=f01,
        profile=FieldProfile.model_validate(prof_no_modis),
        crops_by_id=real_catalog.crops_by_id,
        rotations=tied_rotations,
        parameters=real_catalog.parameters,
    )
    assert [ev.rotation_id for ev in tie_res.evaluations] == [
        "rot_pk_cotton_wheat",
        "rot_a_clone",
        "rot_b_clone",
    ]
    assert [ev.rank for ev in tie_res.evaluations] == [1, 2, 3]

    # Exact percentile check without artificial mean clamping:
    # Construct 20 years where 19 years are viable (score 100) and 1 catastrophic year fails (score 0).
    # Then p10 == p90 == 100.0 while mean overall < 100.0 — overall_low must stay 100.0 (unclamped)!
    skew_dict = make_synthetic_profile_dict(
        field_id="F05", region_id="us_midwest", data_mode="demo", n_years=20, start_year=2005
    )
    for rec in skew_dict["monthly"]:
        rec["rain_mm"] = 120.0
        rec["heat_days_ge"] = {"30": 0, "34": 0, "38": 0, "42": 0}
        rec["frost_days_le_0c"] = 0
        if rec["year"] == 2005 and rec["month"] in (5, 6, 7, 8, 9, 10):
            rec["rain_mm"] = 0.0  # 1 catastrophic year out of 20 (5% < 10th percentile)

    f05 = real_catalog.fields_by_id["F05"]
    skew_res = evaluate_rotations(
        field=f05,
        profile=FieldProfile.model_validate(skew_dict),
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
        priorities=Priorities(w_water=0.0, w_soil=0.0, w_income=0.0, w_resilience=1.0),
    )
    cs = next(ev for ev in skew_res.evaluations if ev.rotation_id == "rot_us_corn_soy")
    expected_vals = np.array(list(cs.annual_overalls.values()), dtype=float)
    assert cs.overall == 95.0
    assert cs.overall_low == round(float(np.percentile(expected_vals, 10)), 2)
    assert cs.overall_low == 100.0  # Proves p10 is NOT clamped down to mean 95.0!


def test_confidence_reflects_demo_vs_observed_coverage_and_dynamic_validated_flag(
    real_catalog: Any,
) -> None:
    """Verify Section 9 confidence rules across demo, unvalidated observed, and validated observed."""
    params_unvalidated = copy.deepcopy(real_catalog.parameters)
    params_validated = copy.deepcopy(real_catalog.parameters)
    params_validated["validated"] = True

    # 1. Demo profile has 0% real-world NASA observation coverage -> always LOW even if validated=True
    demo_prof = FieldProfile.model_validate(
        make_synthetic_profile_dict(field_id="F01", region_id="pk_punjab", data_mode="demo", n_years=12)
    )
    rep_demo = assess_coverage_and_confidence(demo_prof, params_validated)
    assert rep_demo.coverage == 0.0
    assert rep_demo.confidence == "LOW"

    # 2. Observed profile with 5/5 pillars (1.0 >= 0.8) and 12 years, but validated=False -> capped at MEDIUM
    obs_full = FieldProfile.model_validate(
        make_synthetic_profile_dict(field_id="F01", region_id="pk_punjab", data_mode="observed", n_years=12)
    )
    rep_unval = assess_coverage_and_confidence(obs_full, params_unvalidated)
    assert rep_unval.coverage == 1.0
    assert rep_unval.confidence == "MEDIUM"

    # 3. Same observed profile when M3 flips `validated: true` -> dynamically reaches HIGH
    rep_high = assess_coverage_and_confidence(obs_full, params_validated)
    assert rep_high.coverage == 1.0
    assert rep_high.confidence == "HIGH"

    # 4. Observed profile with < 10 years -> MEDIUM even when validated=True and coverage=1.0
    obs_short = FieldProfile.model_validate(
        make_synthetic_profile_dict(field_id="F01", region_id="pk_punjab", data_mode="observed", n_years=8)
    )
    assert assess_coverage_and_confidence(obs_short, params_validated).confidence == "MEDIUM"

    # 5. Observed profile with 2/5 pillars (0.4 < 0.5) -> LOW
    obs_sparse = FieldProfile.model_validate(
        make_synthetic_profile_dict(
            field_id="F01",
            region_id="pk_punjab",
            data_mode="observed",
            n_years=12,
            pillar_qualities={
                "power": "observed",
                "soil": "observed",
                "smap": "unavailable",
                "modis": "unavailable",
                "terrain": "unavailable",
            },
        )
    )
    rep_sparse = assess_coverage_and_confidence(obs_sparse, params_validated)
    assert math.isclose(rep_sparse.coverage, 0.4)
    assert rep_sparse.confidence == "LOW"


def test_empty_monthly_profile_raises_profile_unavailable(real_catalog: Any) -> None:
    f01 = real_catalog.fields_by_id["F01"]
    empty_dict = make_synthetic_profile_dict(field_id="F01", region_id="pk_punjab", data_mode="demo")
    empty_dict["monthly"] = []
    with pytest.raises(ProfileUnavailableError):
        evaluate_rotations(
            field=f01,
            profile=FieldProfile.model_validate(empty_dict),
            crops_by_id=real_catalog.crops_by_id,
            rotations=real_catalog.rotations,
            parameters=real_catalog.parameters,
        )
