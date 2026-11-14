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
        scenario=scenario,
    )

    assert resp.field_id == "F01"
    assert resp.data_mode == "demo"
    assert resp.scenario_applied is True
    assert "does not replace" in resp.disclaimer
    assert "demo" in resp.disclaimer.lower()
    assert "validated=false" in resp.disclaimer
    assert "not a NASA forecast" in resp.disclaimer

    # Demo profile must never expose 'observed' quality badges
    assert all(q in ("demo", "unavailable") for q in resp.data_quality.values())

    existing = next(r for r in resp.rotations if r.is_existing)
    water_alt = next(r for r in resp.rotations if r.rotation_id == "rot_pk_sorghum_chickpea")

    # Existing rotation `why` explains baseline rank plus strongest and weakest relative pillars
    assert len(existing.why) == 3
    assert "Strongest relative pillar" in existing.why[1]
    assert "Primary vulnerability" in existing.why[2]

    # Alternative `why` highlights overall delta + top 2 component differences
    assert len(water_alt.why) == 3
    assert existing.label in water_alt.why[0]

    # Chickpea fixes 50 kg N/ha -> explicitly cited in `benefits`
    assert any("50 kg N/ha" in b for b in water_alt.benefits)
    # Cotton-Wheat has 0 kg N/ha -> explicitly cited in `risks`
    assert any("0 kg N/ha" in r for r in existing.risks)

    # Local review flags check: unvalidated parameters, farmer_input, demo_polygon, 9 km SMAP, 250 m MODIS
    review_joined = " ".join(existing.needs_local_review)
    assert "validated=false" in review_joined
    assert "farmer_input" in review_joined
    assert "demo_polygon" in review_joined
    assert "9 km" in review_joined
    assert "250 m" in review_joined

    # Demo data gap explicitly noted, and evidence sources clearly indicate demo fixture
    assert any("data_mode='demo'" in g for g in existing.data_gaps)
    for ev_item in existing.evidence:
        assert ev_item.variable
        assert ev_item.unit
        assert ev_item.source
        assert ev_item.interpretation


def test_missing_pillars_and_gwetroot_fallback_flagged_accurately(
    real_catalog: Any,
) -> None:
    """Verify unavailable SMAP/MODIS/Terrain are reported in `data_gaps` and null in `evidence`."""
    f05 = real_catalog.fields_by_id["F05"]
    raw_meta = real_catalog.raw_fields_by_id["F05"]

    sparse_dict = make_synthetic_profile_dict(
        field_id="F05",
        region_id="us_midwest",
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
    )

    existing = next(r for r in resp.rotations if r.is_existing)
    gaps_text = " ".join(existing.data_gaps)
    assert "SMAP L4" in gaps_text
    assert "MODIS MOD13Q1" in gaps_text
    assert "Copernicus DEM" in gaps_text
    assert "bare_days_est_mean" in gaps_text
    assert "missing rainfall/temperature" in gaps_text

    smap_ev = next(e for e in existing.evidence if e.variable == "smap_rootzone_mean_m3m3")
    assert smap_ev.value is None

    # Also verify MERRA-2 GWETROOT fallback labeling when SMAP falls back to POWER GWETROOT
    gwet_dict = make_synthetic_profile_dict(
        field_id="F05", region_id="us_midwest", data_mode="observed"
    )
    gwet_dict["data_sources"]["smap"] = "NASA POWER GWETROOT (MERRA-2 model output)"
    gwet_dict["data_quality"]["smap"] = "derived"
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
    )
    assert any("GWETROOT" in item for item in gwet_resp.rotations[0].needs_local_review)
