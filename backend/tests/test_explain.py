"""Tests for deterministic explanation, provenance, data gaps, and local-review flags (`explain.py`)."""

from __future__ import annotations

from typing import Any

from app.models.schemas import FieldProfile, Scenario
from app.services.explain import build_compare_response
from app.services.rotation_engine import evaluate_rotations
from tests.conftest import make_synthetic_profile_dict


def test_explanations_trace_to_calculated_numbers_and_flag_demo_provenance(
    real_catalog: Any,
    f01_demo_profile: FieldProfile,
) -> None:
    """Verify `why`, `benefits`, `risks`, `evidence`, `needs_local_review`, and `disclaimer`."""
    f01 = real_catalog.fields_by_id["F01"]
    raw_meta = real_catalog.raw_fields_by_id["F01"]
    scenario = Scenario(rain_multiplier=0.85, temp_delta_c=1.5)

    engine_res = evaluate_rotations(
        field=f01,
        profile=f01_demo_profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
        scenario=scenario,
    )
    resp = build_compare_response(
        engine_result=engine_res,
        field=f01,
        raw_field_meta=raw_meta,
        profile=f01_demo_profile,
        parameters=real_catalog.parameters,
        nasa_metadata_by_id=real_catalog.nasa_metadata_by_id,
        crops_by_id=real_catalog.crops_by_id,
        scenario=scenario,
    )

    assert resp.field_id == "F01"
    assert resp.data_mode == "demo"
    assert resp.scenario_applied is True
    assert "does not replace" in resp.disclaimer
    assert "demonstration data" in resp.disclaimer.lower()
    assert "not yet been checked" in resp.disclaimer
    assert "not a NASA forecast" in resp.disclaimer

    # Demo profile must never expose 'observed' quality badges
    assert all(q in ("demo", "unavailable") for q in resp.data_quality.values())

    existing = next(r for r in resp.rotations if r.is_existing)
    water_alt = next(r for r in resp.rotations if r.rotation_id == "rot_pk_sorghum_chickpea")

    # Existing rotation `why` states its score and rank against the best alternative
    assert "ranks #" in existing.why[0]
    # Alternative `why` compares against the current rotation by name
    assert existing.label in water_alt.why[0]

    # Chickpea's cited net nitrogen is a benefit with its source attached
    n_chickpea = real_catalog.crops_by_id["chickpea"]["n_fix_kg_ha"]
    n_ins = next(i for i in water_alt.insights if i.topic == "nitrogen" and i.kind == "benefit")
    assert f"{n_chickpea:.0f} kg" in n_ins.detail and n_ins.source and n_ins.source_url
    # Cotton-Wheat has no legume -> flagged as a risk
    assert any(i.topic == "nitrogen" and i.kind == "risk" for i in existing.insights)

    # Local checks are specific to the rotation (sowing months) and parameters status
    review_joined = " ".join(existing.needs_local_review)
    assert "Cotton sown in May" in review_joined
    assert "agronomist" in review_joined.lower()

    # Demo data gap explicitly noted; every insight carries a title and detail
    assert any("Demonstration data" in g for g in existing.data_gaps)
    assert all(i.title and i.detail for i in existing.insights)
    for ev_item in existing.evidence:
        assert ev_item.variable and ev_item.source and ev_item.interpretation and ev_item.group
        assert ev_item.value is not None


def test_missing_pillars_and_gwetroot_fallback_flagged_accurately(
    real_catalog: Any,
) -> None:
    """Verify unavailable SMAP/MODIS/Terrain are reported in `data_gaps` and null in `evidence`."""
    f05 = real_catalog.fields_by_id["F01"]
    raw_meta = real_catalog.raw_fields_by_id["F01"]

    sparse_dict = make_synthetic_profile_dict(
        field_id="F01",
        region_id="pk_punjab",
        data_mode="observed",
        pillar_qualities={
            "power": "observed",
            "smap": "unavailable",
            "modis": "unavailable",
            "soil": "observed",
            "terrain": "unavailable",
        },
    )
    # Null one climate month to verify missing-month gap reporting
    sparse_dict["monthly"][5]["rain_mm"] = None
    profile = FieldProfile.model_validate(sparse_dict)

    engine_res = evaluate_rotations(
        field=f05,
        profile=profile,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
    )
    resp = build_compare_response(
        engine_result=engine_res,
        field=f05,
        raw_field_meta=raw_meta,
        profile=profile,
        parameters=real_catalog.parameters,
        nasa_metadata_by_id=real_catalog.nasa_metadata_by_id,
        crops_by_id=real_catalog.crops_by_id,
    )

    existing = next(r for r in resp.rotations if r.is_existing)
    gaps_text = " ".join(existing.data_gaps)
    # Sources that were never part of the analysis are not listed as gaps
    assert "SMAP" not in gaps_text and "MODIS" not in gaps_text
    assert "Slope unknown" in gaps_text
    assert "months of weather missing" in gaps_text
    # No market data -> income gap is explained
    assert "Income not compared" in gaps_text
    # Evidence never contains empty (null) rows
    assert all(e.value is not None for e in existing.evidence)

    # Also verify MERRA-2 GWETROOT fallback labeling when SMAP falls back to POWER GWETROOT
    gwet_dict = make_synthetic_profile_dict(
        field_id="F05", region_id="us_midwest", data_mode="observed"
    )
    gwet_dict["data_sources"]["smap"] = "NASA POWER GWETROOT (MERRA-2 model output)"
    gwet_dict["data_quality"]["smap"] = "derived"
    gwet_dict["climatology"]["gwetroot_mean"] = 0.42
    gwet_prof = FieldProfile.model_validate(gwet_dict)
    gwet_engine = evaluate_rotations(
        field=f05,
        profile=gwet_prof,
        crops_by_id=real_catalog.crops_by_id,
        rotations=real_catalog.rotations,
        parameters=real_catalog.parameters,
    )
    gwet_resp = build_compare_response(
        engine_result=gwet_engine,
        field=f05,
        raw_field_meta=raw_meta,
        profile=gwet_prof,
        parameters=real_catalog.parameters,
        nasa_metadata_by_id=real_catalog.nasa_metadata_by_id,
        crops_by_id=real_catalog.crops_by_id,
    )
    assert any("MERRA-2" in item for item in gwet_resp.rotations[0].needs_local_review)
