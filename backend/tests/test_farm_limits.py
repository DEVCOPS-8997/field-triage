"""Farmer limits (FarmConstraints), deterministic shortlist, farm year and key moments (offline)."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import pytest

from app.models.schemas import FarmConstraints, FieldProfile, Scenario
from app.services.explain import build_compare_response
from app.services.farm_year import build_farm_year, cycle_layout, month_runs, stage_for_month
from app.services.m1_profile import profile_from_daily
from app.services.rotation_engine import SHORTLIST_ORDER, evaluate_rotations
from tests.conftest import make_synthetic_profile_dict


def _profile(data_mode: str = "demo", heavy_months: tuple[int, ...] | None = None) -> FieldProfile:
    d = make_synthetic_profile_dict(field_id="F01", region_id="pk_punjab", data_mode=data_mode)
    if heavy_months is not None:
        for rec in d["monthly"]:
            rec["heavy_rain_days_ge_25mm"] = 1 if rec["month"] in heavy_months else 0
    return FieldProfile.model_validate(d)


def _run(cat: Any, profile: FieldProfile, constraints: FarmConstraints | None = None, **kw: Any):
    return evaluate_rotations(
        field=cat.fields_by_id["F01"],
        profile=profile,
        crops_by_id=cat.crops_by_id,
        rotations=cat.rotations,
        parameters=cat.parameters,
        constraints=constraints,
        **kw,
    )


def _response(cat: Any, profile: FieldProfile, constraints: FarmConstraints | None = None, **kw: Any):
    res = _run(cat, profile, constraints, **kw)
    return res, build_compare_response(
        engine_result=res,
        field=cat.fields_by_id["F01"],
        raw_field_meta=cat.raw_fields_by_id["F01"],
        profile=profile,
        parameters=cat.parameters,
        nasa_metadata_by_id=cat.nasa_metadata_by_id,
        crops_by_id=cat.crops_by_id,
        market_crops=kw.get("market_crops"),
    )


def _kinds(ev: Any) -> set[str]:
    return {k for k, _ in ev.constraint_failures}


# ------------------------------------------------------------------------------------ limits
def test_no_constraints_keeps_old_behaviour(real_catalog: Any) -> None:
    res, resp = _response(real_catalog, _profile())
    assert res.constraints is None and resp.constraints_applied is None
    assert all(ev.fits_constraints and not ev.constraint_failures for ev in res.evaluations)
    assert resp.total_candidates == len(resp.rotations) == len(res.evaluations)
    # Tier irrigation is still used when the farmer gives no water figure.
    tier = real_catalog.parameters["irrigation_mm"][real_catalog.fields_by_id["F01"].irrigation]
    assert all(ev.irrigation_mm == tier for ev in res.evaluations)


def test_water_available_replaces_tier_and_fails_thirsty_rotations(real_catalog: Any) -> None:
    prof = _profile()
    dry = _run(real_catalog, prof, FarmConstraints(water_available_mm=0))
    wet = _run(real_catalog, prof, FarmConstraints(water_available_mm=3000))
    assert all(ev.irrigation_mm == 0 for ev in dry.evaluations)
    assert all(ev.irrigation_mm == 3000 for ev in wet.evaluations)
    assert not any("water" in _kinds(ev) for ev in wet.evaluations)
    rice = next(ev for ev in dry.evaluations if ev.rotation_id == "rot_pk_rice_wheat")
    assert "water" in _kinds(rice) and not rice.fits_constraints
    sentence = next(s for k, s in rice.constraint_failures if k == "water")
    assert "Rice" in sentence and "mm of irrigation per season" in sentence and "you said you have 0 mm" in sentence


def test_min_income_fails_known_low_income_and_flags_unknown(real_catalog: Any) -> None:
    prof = _profile()
    market = {cid: {"yield_kg_ha": 2000.0, "price_usd_t": 300.0} for cid in real_catalog.crops_by_id}
    high = _run(real_catalog, prof, FarmConstraints(min_income_usd_ha=1_000_000), market_crops=market)
    low = _run(real_catalog, prof, FarmConstraints(min_income_usd_ha=0), market_crops=market)
    assert all("income" in _kinds(ev) for ev in high.evaluations)
    assert all("$1,000,000" in s for ev in high.evaluations for k, s in ev.constraint_failures if k == "income")
    assert not any("income" in _kinds(ev) for ev in low.evaluations)

    # Unknown income never fails, but explain.py reports it as a gap.
    res, resp = _response(real_catalog, prof, FarmConstraints(min_income_usd_ha=500))
    assert all(ev.income_unchecked and "income" not in _kinds(ev) for ev in res.evaluations)
    for r in resp.rotations:
        gap = [i for i in r.insights if i.kind == "gap" and "could not be checked against your target" in i.title]
        assert gap and "$500" in gap[0].detail


def test_max_bad_seasons(real_catalog: Any) -> None:
    prof = _profile()
    lenient = _run(real_catalog, prof, FarmConstraints(max_bad_seasons_in_10=10))
    strict = _run(real_catalog, prof, FarmConstraints(max_bad_seasons_in_10=0))
    assert not any("risk" in _kinds(ev) for ev in lenient.evaluations)
    for ev in strict.evaluations:
        failed = ev.evaluated_seasons_count - ev.viable_seasons_count
        assert ("risk" in _kinds(ev)) == (failed > 0)
    assert any("risk" in _kinds(ev) for ev in strict.evaluations)


def test_unavailable_equipment_by_crop_and_by_type(real_catalog: Any) -> None:
    prof = _profile()
    res = _run(
        real_catalog, prof,
        FarmConstraints(unavailable_equipment=["rice_transplanting", "orchard_commitment", "daily_market_access"]),
    )
    by_id = {ev.rotation_id: ev for ev in res.evaluations}
    assert "equipment" in _kinds(by_id["rot_pk_rice_wheat"])
    assert any("Rice" in s for _, s in by_id["rot_pk_rice_wheat"].constraint_failures)
    assert "equipment" in _kinds(by_id["rot_pk_citrus_berseem_intercrop"])  # fruit -> orchard (by type)
    assert "equipment" in _kinds(by_id["rot_pk_bitter_gourd_carrot"])  # vegetables -> market
    assert "equipment" not in _kinds(by_id["rot_pk_cotton_wheat"])
    assert "equipment" not in _kinds(by_id["rot_pk_maize_potato_onion"])  # storable crops: no daily market
    assert real_catalog.parameters["equipment_needs"]["status"] == "illustrative"


def test_constraint_failures_reach_response_and_insights(real_catalog: Any) -> None:
    c = FarmConstraints(water_available_mm=0, unavailable_equipment=["seed_drill"])
    _res, resp = _response(real_catalog, _profile(), c)
    assert resp.constraints_applied == c.model_dump(mode="json")
    cw = next(r for r in resp.rotations if r.rotation_id == "rot_pk_cotton_wheat")
    assert not cw.fits_constraints and cw.constraint_failures
    farm = [i for i in cw.insights if i.kind == "risk" and i.topic == "farm"]
    assert len(farm) == len(cw.constraint_failures)
    assert {i.detail for i in farm} == set(cw.constraint_failures)


# --------------------------------------------------------------------------------- shortlist
def test_shortlist_rule_and_rank_unchanged(real_catalog: Any) -> None:
    prof = _profile()
    base = _run(real_catalog, prof)
    c = FarmConstraints(unavailable_equipment=["seed_drill"], max_bad_seasons_in_10=4)
    res = _run(real_catalog, prof, c)
    # Limits never change scores or rank.
    assert [(e.rotation_id, e.rank, e.overall) for e in base.evaluations] == [
        (e.rotation_id, e.rank, e.overall) for e in res.evaluations
    ]

    evs = sorted(res.evaluations, key=lambda e: e.rank)
    expected: dict[str, str] = {e.rotation_id: "Your current rotation" for e in evs if e.is_existing}
    for strategy, reason in SHORTLIST_ORDER:
        pick = next((e for e in evs if e.strategy_type == strategy and e.fits_constraints and e.rotation_id not in expected), None)
        if pick:
            expected[pick.rotation_id] = reason
    got = {e.rotation_id: e.shortlist_reason for e in evs if e.shortlisted}
    assert got == expected
    assert all(e.shortlist_reason is None for e in evs if not e.shortlisted)
    existing = next(e for e in evs if e.is_existing)
    assert existing.shortlisted and existing.shortlist_reason == "Your current rotation"
    # Every shortlisted alternative fits the limits.
    assert all(e.fits_constraints for e in evs if e.shortlisted and not e.is_existing)


def test_shortlist_skips_types_with_no_fitting_rotation(real_catalog: Any) -> None:
    # Strict limits: a strategy type with no fitting rotation gets no shortlist slot.
    res = _run(
        real_catalog, _profile(),
        FarmConstraints(max_bad_seasons_in_10=0, unavailable_equipment=["daily_market_access", "seed_drill"]),
    )
    evs = list(res.evaluations)
    for strategy, _reason in SHORTLIST_ORDER:
        fitting = [e for e in evs if e.strategy_type == strategy and e.fits_constraints and not e.is_existing]
        listed = [e for e in evs if e.strategy_type == strategy and e.shortlisted and not e.is_existing]
        assert len(listed) == (1 if fitting else 0)
    assert any(not [e for e in evs if e.strategy_type == s and e.fits_constraints] for s, _ in SHORTLIST_ORDER)


def test_same_input_gives_identical_output(real_catalog: Any) -> None:
    c = FarmConstraints(water_available_mm=350, max_bad_seasons_in_10=3, unavailable_equipment=["picking_labour"])
    prof = _profile("observed", heavy_months=(7, 8))
    _a, ra = _response(real_catalog, prof, c, scenario=Scenario(rain_multiplier=0.9, temp_delta_c=1.0))
    _b, rb = _response(real_catalog, prof, c, scenario=Scenario(rain_multiplier=0.9, temp_delta_c=1.0))
    assert ra.model_dump() == rb.model_dump()


# --------------------------------------------------------------------------------- farm year
def test_farm_year_shape_stage_and_bare_months(real_catalog: Any) -> None:
    res, resp = _response(real_catalog, _profile(heavy_months=(7, 8)))
    for r in resp.rotations:
        assert [m.month for m in r.farm_year] == list(range(1, 13))
        for m in r.farm_year:
            assert m.bare == (not m.crops)
            if m.heat_risk is not None:  # some cash crop flowers here (stage names the main crop)
                assert m.crops and not m.bare and m.stage is not None
            if m.bare:
                assert m.stage is None and m.dry_risk is None and m.frost_risk is None
            assert m.erosion_alert == (m.bare and m.heavy_rain_risk is not None and m.heavy_rain_risk >= 0.3)
    cw = {m.month: m for m in next(r for r in resp.rotations if r.rotation_id == "rot_pk_cotton_wheat").farm_year}
    assert not any(m.bare for m in cw.values())
    assert cw[5].crops == ["Cotton"] and cw[5].stage == "sowing"
    assert cw[11].crops == ["Cotton", "Wheat"] and cw[11].stage == "harvest"
    assert cw[4].crops == ["Wheat"] and cw[4].stage == "harvest"
    # Demo profile: synthetic NDVI is never shown as observed MODIS greenness.
    assert all(m.ndvi is None for m in cw.values())

    mc = {m.month: m for m in next(r for r in resp.rotations if r.rotation_id == "rot_pk_muskmelon_chickpea").farm_year}
    bare = {k for k, m in mc.items() if m.bare}
    assert bare == {6, 7, 8, 9}
    assert mc[7].erosion_alert and mc[8].erosion_alert and not mc[6].erosion_alert
    assert mc[7].heavy_rain_risk == 1.0 and mc[6].heavy_rain_risk == 0.0


def test_missing_heavy_rain_stays_none(real_catalog: Any) -> None:
    res = _run(real_catalog, _profile())  # synthetic profile has no heavy-rain counts
    assert all(m.heavy_rain_risk is None and not m.erosion_alert for ev in res.evaluations for m in ev.farm_year)


def test_multi_year_cycle_fold_rule() -> None:
    def crop(cid: str, sow: int, harv: int) -> dict[str, Any]:
        return {
            "crop_id": cid, "name": cid.upper(), "type": "cereal", "heat_threshold_c": 30,
            "frost_sensitive": True, "water_need_mm": 400, "kc": [0.4, 1.1, 0.5],
            "calendars": {"r": {"sow_month": sow, "harvest_month": harv, "stage_fractions": [0.2, 0.3, 0.3, 0.2]}},
        }

    x, y = crop("x", 3, 8), crop("y", 5, 10)
    layout = cycle_layout([x, y], None, "r")
    assert layout.cycle_months == 24
    prof = _profile()
    fy = build_farm_year(
        sequence_crops=[x, y], cover_crop=None, region_id="r", monthly=prof.monthly,
        scenario=Scenario(), heat_buckets_c=[30, 34, 38, 42], parameters={}, layout=layout,
    )
    by = {m.month: m for m in fy.months}
    # Year 1: X Mar-Aug; year 2: Y May-Oct. Bare only where bare in BOTH cycle years.
    assert {k for k, m in by.items() if m.bare} == {11, 12, 1, 2}
    assert by[3].crops == ["X"] and by[9].crops == ["Y"]
    assert by[5].crops == ["X", "Y"] and by[5].stage == stage_for_month(2, 6, [0.2, 0.3, 0.3, 0.2])


def test_stage_mapping_and_month_runs() -> None:
    fr = [0.2, 0.3, 0.3, 0.2]
    assert [stage_for_month(k, 6, fr) for k in range(6)] == ["sowing", "growing", "growing", "flowering", "flowering", "harvest"]
    assert month_runs({12, 1, 2, 6}) == [[6], [12, 1, 2]]
    assert month_runs(set(range(1, 13))) == [list(range(1, 13))]


def test_key_moments_and_satellite_sentence(real_catalog: Any) -> None:
    _res, demo = _response(real_catalog, _profile(heavy_months=(7, 8)))
    for r in demo.rotations:
        assert 2 <= len(r.key_moments) <= 3
        assert not any("MODIS" in s for s in r.key_moments)
    mc = next(r for r in demo.rotations if r.rotation_id == "rot_pk_muskmelon_chickpea")
    assert mc.key_moments[0].startswith("Your field is usually bare in June")

    _res, obs = _response(real_catalog, _profile("observed", heavy_months=(7, 8)))
    current = next(r for r in obs.rotations if r.is_existing)
    assert any("NASA MODIS satellite greenness" in s for s in current.key_moments)
    assert all(m.ndvi is not None for m in current.farm_year)
    assert not any("MODIS" in s for r in obs.rotations if not r.is_existing for s in r.key_moments)


def test_water_need_and_gap_populated(real_catalog: Any) -> None:
    _res, resp = _response(real_catalog, _profile())
    for r in resp.rotations:
        assert r.mean_water_need_mm is not None and r.mean_water_need_mm > 0
        assert r.mean_irrigation_gap_mm is not None and 0 <= r.mean_irrigation_gap_mm <= r.mean_water_need_mm


# ------------------------------------------------------------------------- heavy-rain field
def test_profile_counts_heavy_rain_days_per_month() -> None:
    dates = pd.date_range("2020-01-01", "2021-12-31", freq="D")
    df = pd.DataFrame({
        "date": dates,
        "PRECTOTCORR": 1.0,
        "T2M": 20.0, "T2M_MAX": 27.0, "T2M_MIN": 13.0,
    })
    df.loc[df.date == "2020-07-10", "PRECTOTCORR"] = 30.0
    df.loc[df.date == "2020-07-20", "PRECTOTCORR"] = 25.0
    df.loc[(df.date.dt.year == 2021) & (df.date.dt.month == 3), "PRECTOTCORR"] = np.nan
    prof = profile_from_daily("T", df)
    by = {(m.year, m.month): m for m in prof.monthly}
    assert by[(2020, 7)].heavy_rain_days_ge_25mm == 2
    assert by[(2020, 8)].heavy_rain_days_ge_25mm == 0
    assert by[(2021, 3)].heavy_rain_days_ge_25mm is None  # no rain data -> None, never 0


@pytest.mark.parametrize("water", [None, 250.0])
def test_dry_risk_uses_farmer_water_only_when_given(real_catalog: Any, water: float | None) -> None:
    c = FarmConstraints(water_available_mm=water) if water is not None else None
    res = _run(real_catalog, _profile(), c)
    cw = next(ev for ev in res.evaluations if ev.rotation_id == "rot_pk_cotton_wheat")
    risks = [m.dry_risk for m in cw.farm_year if m.dry_risk is not None]
    assert risks and all(0.0 <= r <= 1.0 for r in risks)
