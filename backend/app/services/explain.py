"""Deterministic, number-traceable explanation and provenance builder (`explain.py`).

Generates `why`, `benefits`, `risks`, `data_gaps`, `needs_local_review`, `evidence`,
merged `data_quality`, and decision-support `disclaimer` strictly from computed
`EngineComparisonResult`, `FieldProfile`, `FieldInfo`, `parameters.json`, and `nasa_metadata.json`.
"""

from __future__ import annotations

from typing import Any

from app.models.schemas import (
    CompareResponse,
    EvidenceItem,
    FieldInfo,
    FieldProfile,
    Quality,
    RotationScore,
    Scenario,
)
from app.services.data_loader import PILLAR_TO_METADATA_ID
from app.services.rotation_engine import (
    EngineComparisonResult,
    PillarCoverageReport,
    RotationEvaluation,
)
from app.utils.validation import is_valid_number

COMPONENT_LABELS: dict[str, str] = {
    "water": "Water efficiency",
    "soil": "Soil health & protection",
    "resilience": "Climate resilience",
    "income": "Market income potential",
}


def _resolve_source_label(
    pillar: str,
    profile: FieldProfile,
    nasa_metadata_by_id: dict[str, dict[str, Any]],
) -> str:
    """Resolve human-readable provenance source string without fabricating observation claims."""
    meta_id = PILLAR_TO_METADATA_ID.get(pillar, pillar)
    explicit = profile.data_sources.get(pillar) or profile.data_sources.get(meta_id)
    meta_entry = nasa_metadata_by_id.get(meta_id)
    default_name = str(meta_entry["name"]) if meta_entry and "name" in meta_entry else pillar.upper()

    if profile.data_mode == "demo":
        base = explicit or default_name
        return base if "demo" in base.lower() else f"{base} (synthetic demo profile)"
    return explicit or default_name


def _build_why(
    evaluation: RotationEvaluation,
    existing_eval: RotationEvaluation,
    alternative_evals: list[RotationEvaluation],
) -> list[str]:
    """Generate `why` statements from the two largest component differences."""
    components = ("water", "soil", "resilience", "income")

    if not evaluation.is_existing:
        deltas = [
            (comp, round(evaluation.scores[comp] - existing_eval.scores[comp], 2))
            for comp in components
        ]
        # Sort by largest absolute difference; break ties deterministically by component order
        ranked_deltas = sorted(
            deltas,
            key=lambda item: (-abs(item[1]), components.index(item[0])),
        )
        top_two = ranked_deltas[:2]
        lines: list[str] = []

        overall_diff = round(evaluation.overall - existing_eval.overall, 2)
        direction = "outscores" if overall_diff > 0 else ("trails" if overall_diff < 0 else "matches")
        lines.append(
            f"Overall score {evaluation.overall:.1f}/100 {direction} current rotation "
            f"{existing_eval.label} ({existing_eval.overall:.1f}/100, {overall_diff:+.1f} pts)."
        )

        for comp, diff in top_two:
            comp_name = COMPONENT_LABELS[comp]
            alt_val = evaluation.scores[comp]
            cur_val = existing_eval.scores[comp]
            if abs(diff) < 0.05:
                lines.append(
                    f"{comp_name} is unchanged relative to {existing_eval.label} ({alt_val:.1f} vs {cur_val:.1f})."
                )
            elif diff > 0:
                lines.append(
                    f"{comp_name} improves by {diff:+.1f} pts vs {existing_eval.label} "
                    f"({alt_val:.1f} vs {cur_val:.1f})."
                )
            else:
                lines.append(
                    f"{comp_name} trades off {diff:+.1f} pts vs {existing_eval.label} "
                    f"({alt_val:.1f} vs {cur_val:.1f})."
                )
        return lines

    # Existing rotation: explain strongest and weakest components relative to evaluated alternatives
    if not alternative_evals:
        return [
            f"Current rotation ({evaluation.label}) achieves an overall score of {evaluation.overall:.1f}/100."
        ]

    rel_diffs: list[tuple[str, float, float]] = []
    for comp in components:
        alt_mean = sum(a.scores[comp] for a in alternative_evals) / float(len(alternative_evals))
        rel_diffs.append((comp, round(evaluation.scores[comp] - alt_mean, 2), round(alt_mean, 2)))

    strongest = max(rel_diffs, key=lambda x: (x[1], -components.index(x[0])))
    weakest = min(rel_diffs, key=lambda x: (x[1], components.index(x[0])))

    best_alt = min(alternative_evals, key=lambda a: a.rank)
    lines = [
        f"Baseline field rotation ({evaluation.overall:.1f}/100, rank #{evaluation.rank}) compared against "
        f"top alternative {best_alt.label} ({best_alt.overall:.1f}/100, rank #{best_alt.rank}).",
        f"Strongest relative pillar is {COMPONENT_LABELS[strongest[0]].lower()} at "
        f"{evaluation.scores[strongest[0]]:.1f}/100 ({strongest[1]:+.1f} pts vs alternatives mean {strongest[2]:.1f}).",
        f"Primary vulnerability relative to alternatives is {COMPONENT_LABELS[weakest[0]].lower()} at "
        f"{evaluation.scores[weakest[0]]:.1f}/100 ({weakest[1]:+.1f} pts vs alternatives mean {weakest[2]:.1f}).",
    ]
    return lines


def _build_benefits_and_risks(
    evaluation: RotationEvaluation,
    existing_eval: RotationEvaluation,
) -> tuple[list[str], list[str]]:
    """Build concrete numerical `benefits` and `risks` from engine intermediates."""
    benefits: list[str] = []
    risks: list[str] = []

    # 1. Nitrogen fixation & organic matter
    if evaluation.total_n_fix_kg_ha > 0:
        benefits.append(
            f"Supplies {evaluation.total_n_fix_kg_ha:.0f} kg N/ha biological nitrogen fixation per cycle, "
            f"supporting a {evaluation.soil_subscores['soil_health']:.1f}/100 soil-health subscore."
        )
    else:
        risks.append(
            "Zero biological nitrogen fixation (0 kg N/ha) in rotation; requires external nitrogen management."
        )

    # 2. Cover crop & bare-period erosion protection
    if evaluation.cover_crop_id is not None:
        bare_cut_pct = max(
            0.0,
            (evaluation.calendar_bare_fraction_without_cover - evaluation.calendar_bare_fraction)
            * 100.0,
        )
        benefits.append(
            f"Cover crop ({evaluation.cover_crop_id}) reduces calendar bare-soil exposure by "
            f"{bare_cut_pct:.0f} percentage points (erosion subscore {evaluation.soil_subscores['erosion']:.1f}/100)."
        )
    elif evaluation.bare_fraction >= 0.35:
        risks.append(
            f"Fallow/bare ground spans {evaluation.bare_fraction * 100.0:.0f}% of the cycle "
            f"(erosion subscore {evaluation.soil_subscores['erosion']:.1f}/100)."
        )
    else:
        benefits.append(
            f"Low bare-soil exposure ({evaluation.bare_fraction * 100.0:.0f}% of cycle) supports "
            f"erosion protection ({evaluation.soil_subscores['erosion']:.1f}/100)."
        )

    # 3. Water demand & irrigation-adjusted deficit
    if not evaluation.is_existing:
        deficit_delta = evaluation.mean_water_deficit_mm - existing_eval.mean_water_deficit_mm
        if deficit_delta <= -25.0:
            benefits.append(
                f"Reduces mean seasonal water deficit by {abs(deficit_delta):.0f} mm/season vs current rotation "
                f"({evaluation.mean_water_deficit_mm:.0f} mm vs {existing_eval.mean_water_deficit_mm:.0f} mm)."
            )
        elif deficit_delta >= 25.0:
            risks.append(
                f"Increases mean seasonal water deficit by {deficit_delta:.0f} mm/season vs current rotation "
                f"({evaluation.mean_water_deficit_mm:.0f} mm vs {existing_eval.mean_water_deficit_mm:.0f} mm)."
            )

    if evaluation.mean_water_deficit_mm > 100.0:
        risks.append(
            f"Mean unmet seasonal water demand of {evaluation.mean_water_deficit_mm:.0f} mm/season "
            f"after accounting for {evaluation.irrigation_mm:.0f} mm assumed irrigation."
        )
    elif evaluation.mean_water_deficit_mm <= 40.0:
        benefits.append(
            f"Well matched to available moisture with {evaluation.mean_water_deficit_mm:.0f} mm/season "
            f"mean unmet water demand (water score {evaluation.scores['water']:.1f}/100)."
        )

    # 4. Pest-break diversity
    if evaluation.soil_subscores["pest_break"] >= 95.0:
        benefits.append(
            f"Alternates distinct botanical pest families across every transition "
            f"(pest-break subscore {evaluation.soil_subscores['pest_break']:.0f}/100)."
        )
    elif evaluation.soil_subscores["pest_break"] < 80.0:
        risks.append(
            f"Contains consecutive same-family host transitions "
            f"(pest-break subscore {evaluation.soil_subscores['pest_break']:.1f}/100), elevating carryover pest pressure."
        )

    # 5. Historical climate viability (heat, frost, drought failures)
    total_s = evaluation.evaluated_seasons_count
    viable_pct = (evaluation.viable_seasons_count / float(total_s)) * 100.0 if total_s else 0.0
    if viable_pct >= 85.0:
        benefits.append(
            f"Viable in {evaluation.viable_seasons_count}/{total_s} ({viable_pct:.0f}%) "
            f"evaluated historical crop seasons."
        )
    if evaluation.heat_failure_count > 0:
        risks.append(
            f"Exceeded crop heat-day tolerance in {evaluation.heat_failure_count}/{total_s} historical crop seasons."
        )
    if evaluation.frost_failure_count > 0:
        risks.append(
            f"Experienced frost during frost-sensitive growth windows in "
            f"{evaluation.frost_failure_count}/{total_s} historical crop seasons."
        )
    if evaluation.water_failure_count > 0:
        risks.append(
            f"Fell below the 60% minimum seasonal moisture threshold in "
            f"{evaluation.water_failure_count}/{total_s} historical crop seasons."
        )

    # 6. Market / commercial income trade-off
    if not evaluation.is_existing:
        income_delta = evaluation.scores["income"] - existing_eval.scores["income"]
        if income_delta >= 5.0:
            benefits.append(
                f"Higher commercial market potential (+{income_delta:.1f} income pts vs current rotation; "
                f"mean market score {evaluation.mean_market_score:.1f}/5)."
            )
        elif income_delta <= -5.0:
            risks.append(
                f"Lower commercial market return ({income_delta:.1f} income pts vs current rotation; "
                f"mean market score {evaluation.mean_market_score:.1f}/5)."
            )

    # Guarantee non-empty concrete entries even in uniform conditions
    if not benefits:
        benefits.append(
            f"Maintains {evaluation.overall:.1f}/100 priority-weighted suitability across {total_s} evaluated seasons."
        )
    if not risks:
        spread = round(evaluation.overall_high - evaluation.overall_low, 1)
        risks.append(
            f"Inter-annual climate variability spans {evaluation.overall_low:.1f} to {evaluation.overall_high:.1f} "
            f"({spread:.1f} pt 10th–90th percentile spread); verify cultivar maturity locally."
        )

    return benefits, risks


def _build_data_gaps(
    evaluation: RotationEvaluation,
    profile: FieldProfile,
    field: FieldInfo,
    coverage_report: PillarCoverageReport,
) -> list[str]:
    """Identify all unavailable data sources, missing variables, and missing historical months."""
    gaps: list[str] = []

    if profile.data_mode == "demo":
        gaps.append(
            "Operating on synthetic demonstration profile (data_mode='demo'); real processed NASA observations are not loaded."
        )

    pillar_descriptions = {
        "power": "NASA POWER historical daily weather observations",
        "smap": "NASA SMAP L4 root-zone soil moisture observations (available 2015 onward)",
        "modis": "NASA MODIS MOD13Q1 250 m NDVI vegetation observations",
        "soil": "SoilGrids 0–30 cm soil texture, organic carbon, and pH estimates",
        "terrain": "SRTM 30 m terrain elevation and slope (`slope_deg`)",
    }

    for pillar, desc in pillar_descriptions.items():
        if coverage_report.pillar_quality.get(pillar) == "unavailable":
            gaps.append(f"Unavailable source: {desc}.")

    if (
        evaluation.is_existing
        and evaluation.bare_fraction_source == "crop_calendar"
        and not is_valid_number(profile.climatology.get("bare_days_est_mean"))
    ):
        gaps.append(
            "MODIS `bare_days_est_mean` unavailable; existing-rotation bare-soil fraction estimated from regional crop calendar."
        )

    if coverage_report.missing_climate_months > 0:
        gaps.append(
            f"{coverage_report.missing_climate_months} monthly climate record(s) in the profile span have missing rainfall/temperature observations."
        )

    if evaluation.incomplete_season_count > 0:
        gaps.append(
            f"{evaluation.incomplete_season_count} historical crop-season window(s) were excluded due to missing monthly climate values (never imputed as zero)."
        )

    if field.market_access is None:
        gaps.append(
            "Field `market_access` rating is missing; income scaling used neutral 3/5 assumption."
        )
    if not field.soil_type:
        gaps.append("Farmer-reported `soil_type` texture classification is missing.")

    return gaps


def _build_needs_local_review(
    field: FieldInfo,
    raw_field_meta: dict[str, Any],
    profile: FieldProfile,
    parameters: dict[str, Any],
    coverage_report: PillarCoverageReport,
    nasa_metadata_by_id: dict[str, dict[str, Any]],
) -> list[str]:
    """Identify unvalidated parameters, farmer-input fields, demo polygons, and sensor resolution limits."""
    items: list[str] = []

    if parameters.get("validated") is not True:
        status_label = parameters.get("status", "illustrative")
        items.append(
            f"Agronomic scoring thresholds in `parameters.json` are unvalidated (`validated=false`, status='{status_label}'); verify water, heat, and irrigation assumptions with a local extension agronomist."
        )

    field_source = raw_field_meta.get("source", "farmer_input")
    items.append(
        f"Field baseline attributes (`current_rotation_id='{field.current_rotation_id}'`, `irrigation='{field.irrigation}'`, `soil_type='{field.soil_type}'`, `market_access={field.market_access}`) originate from `{field_source}` and require on-farm confirmation."
    )

    boundary_source = raw_field_meta.get("boundary_source", "demo_polygon")
    if boundary_source == "demo_polygon":
        items.append(
            "Field geometry is a hand-drawn demonstration polygon (`boundary_source='demo_polygon'`); NASA datasets do not supply parcel boundaries."
        )

    smap_meta = nasa_metadata_by_id.get("smap_l4", {})
    smap_res = smap_meta.get("resolution", "9 km")
    smap_source_str = str(
        profile.data_sources.get("smap") or profile.data_sources.get("smap_l4") or ""
    )
    if "gwetroot" in smap_source_str.lower() or "merra" in smap_source_str.lower():
        items.append(
            "Root-zone wetness uses NASA POWER `GWETROOT` (MERRA-2 assimilation model output, not direct SMAP L4 retrieval); interpret field moisture with local soil probes."
        )
    elif coverage_report.pillar_quality.get("smap") != "unavailable":
        items.append(
            f"SMAP L4 soil moisture has ~{smap_res} spatial resolution (one grid cell covers many farms and masks plot-scale irrigation or drainage differences)."
        )

    modis_meta = nasa_metadata_by_id.get("modis_mod13q1", {})
    modis_res = modis_meta.get("resolution", "250 m")
    if coverage_report.pillar_quality.get("modis") != "unavailable":
        items.append(
            f"MODIS MOD13Q1 NDVI has {modis_res} pixel resolution and 16-day compositing, which can blend adjacent fields and miss short tillage windows on small plots."
        )

    if coverage_report.pillar_quality.get("soil") != "unavailable":
        items.append(
            "SoilGrids properties are 250 m machine-learning predictions, not laboratory soil tests; confirm salinity, pH, and nutrient status via local soil sampling."
        )

    return items


def _build_evidence(
    evaluation: RotationEvaluation,
    field: FieldInfo,
    raw_field_meta: dict[str, Any],
    profile: FieldProfile,
    nasa_metadata_by_id: dict[str, dict[str, Any]],
) -> list[EvidenceItem]:
    """Construct traceable `EvidenceItem` records strictly from actual inputs and computed metrics."""
    power_src = _resolve_source_label("power", profile, nasa_metadata_by_id)
    smap_src = _resolve_source_label("smap", profile, nasa_metadata_by_id)
    modis_src = _resolve_source_label("modis", profile, nasa_metadata_by_id)
    soil_src = _resolve_source_label("soil", profile, nasa_metadata_by_id)
    terrain_src = _resolve_source_label("terrain", profile, nasa_metadata_by_id)
    farmer_src = str(raw_field_meta.get("source", "farmer_input"))

    evidence: list[EvidenceItem] = []

    rain_ann = profile.climatology.get("rain_annual_mm_mean")
    evidence.append(
        EvidenceItem(
            variable="rain_annual_mm_mean",
            value=round(float(rain_ann), 1) if is_valid_number(rain_ann) else None,
            unit="mm/year",
            source=power_src,
            interpretation=(
                f"Multi-year mean annual rainfall ({float(rain_ann):.1f} mm/yr over {profile.n_years} yr baseline)."
                if is_valid_number(rain_ann)
                else "Annual rainfall climatology unavailable."
            ),
        )
    )

    viability_pct = round(
        (evaluation.viable_seasons_count / float(evaluation.evaluated_seasons_count)) * 100.0,
        1,
    )
    evidence.append(
        EvidenceItem(
            variable="season_viability_rate",
            value=viability_pct,
            unit="%",
            source=f"Derived ({power_src} + crops.json + parameters.json)",
            interpretation=(
                f"{evaluation.viable_seasons_count} of {evaluation.evaluated_seasons_count} evaluated seasons met heat, frost, and 60% water thresholds."
            ),
        )
    )

    evidence.append(
        EvidenceItem(
            variable="mean_season_water_deficit_mm",
            value=evaluation.mean_water_deficit_mm,
            unit="mm/season",
            source=f"Derived ({power_src} + farmer_input irrigation='{field.irrigation}')",
            interpretation=(
                f"Mean unmet crop water demand after {evaluation.mean_season_rain_mm:.0f} mm seasonal rain and {evaluation.irrigation_mm:.0f} mm assumed irrigation."
            ),
        )
    )

    smap_mean = profile.climatology.get("smap_rootzone_mean_m3m3")
    evidence.append(
        EvidenceItem(
            variable="smap_rootzone_mean_m3m3",
            value=round(float(smap_mean), 3) if is_valid_number(smap_mean) else None,
            unit="m3/m3",
            source=smap_src,
            interpretation=(
                f"Historical mean 9 km root-zone soil moisture ({float(smap_mean):.3f} m3/m3)."
                if is_valid_number(smap_mean)
                else "SMAP L4 root-zone soil moisture unavailable (retained as null)."
            ),
        )
    )

    bare_days = profile.climatology.get("bare_days_est_mean")
    if evaluation.bare_fraction_source == "modis_ndvi" and is_valid_number(bare_days):
        evidence.append(
            EvidenceItem(
                variable="bare_days_est_mean",
                value=round(float(bare_days), 1),
                unit="days/year",
                source=modis_src,
                interpretation=(
                    f"MODIS NDVI < threshold estimated {float(bare_days):.1f} bare-field days/yr ({evaluation.bare_fraction * 100.0:.1f}% of year)."
                ),
            )
        )
    else:
        evidence.append(
            EvidenceItem(
                variable="calendar_bare_fraction",
                value=round(evaluation.bare_fraction * 100.0, 1),
                unit="%",
                source="Derived (regional crop calendar in crops.json)",
                interpretation=(
                    f"Regional sowing/harvest schedule leaves soil bare for {evaluation.bare_fraction * 100.0:.1f}% of the {evaluation.cycle_months}-month rotation cycle."
                ),
            )
        )

    soc_val = profile.soil.get("soil_soc_g_kg")
    if is_valid_number(soc_val):
        evidence.append(
            EvidenceItem(
                variable="soil_soc_g_kg",
                value=round(float(soc_val), 2),
                unit="g/kg",
                source=soil_src,
                interpretation=f"0–30 cm depth-weighted soil organic carbon ({float(soc_val):.2f} g/kg).",
            )
        )

    if evaluation.slope_deg_used is not None:
        evidence.append(
            EvidenceItem(
                variable="slope_deg",
                value=round(evaluation.slope_deg_used, 2),
                unit="deg",
                source=terrain_src,
                interpretation=f"Terrain slope ({evaluation.slope_deg_used:.2f} deg) applied in erosion calculation.",
            )
        )

    evidence.append(
        EvidenceItem(
            variable="current_rotation_id",
            value=field.current_rotation_id,
            unit="id",
            source=farmer_src,
            interpretation=f"Farmer-reported current rotation ('{field.current_rotation_id}') with '{field.irrigation}' irrigation.",
        )
    )

    return evidence


def build_merged_data_quality(
    profile: FieldProfile,
    coverage_report: PillarCoverageReport,
) -> dict[str, Quality]:
    """Build transparent response-level `data_quality` dictionary preserving profile labels."""
    merged: dict[str, Quality] = {}

    for key, val in profile.data_quality.items():
        if profile.data_mode == "demo" and val in ("observed", "derived"):
            merged[key] = "demo"
        else:
            merged[key] = val

    for pillar, qual in coverage_report.pillar_quality.items():
        merged[pillar] = qual

    merged["rotation_scores"] = "demo" if profile.data_mode == "demo" else "derived"
    return merged


def build_disclaimer(
    *,
    data_mode: str,
    scenario_applied: bool,
    parameters_validated: bool,
    scenario: Scenario | None = None,
) -> str:
    """Construct clear decision-support and provenance disclaimer."""
    parts = [
        "Decision-support tool only: Field Shift Advisor supports—and does not replace—farmers and local agricultural advisers.",
    ]
    if data_mode == "demo":
        parts.append(
            "Results shown use synthetic demonstration environmental profiles (`data_mode='demo'`), not observed NASA measurements."
        )
    if not parameters_validated:
        parts.append(
            "Agronomic scoring thresholds are currently marked illustrative (`validated=false`) and require local review."
        )
    if scenario_applied and scenario is not None:
        parts.append(
            f"Scenario adjustments (rain_multiplier={scenario.rain_multiplier:.2f}, temp_delta_c=+{scenario.temp_delta_c:.1f} C) represent simulated conditions, not a NASA forecast."
        )
    return " ".join(parts)


def build_compare_response(
    *,
    engine_result: EngineComparisonResult,
    field: FieldInfo,
    raw_field_meta: dict[str, Any],
    profile: FieldProfile,
    parameters: dict[str, Any],
    nasa_metadata_by_id: dict[str, dict[str, Any]],
    scenario: Scenario | None = None,
) -> CompareResponse:
    """Assemble full `CompareResponse` with explanations, evidence, gaps, and provenance."""
    existing_eval = next(ev for ev in engine_result.evaluations if ev.is_existing)
    alternative_evals = [ev for ev in engine_result.evaluations if not ev.is_existing]

    shared_local_review = _build_needs_local_review(
        field=field,
        raw_field_meta=raw_field_meta,
        profile=profile,
        parameters=parameters,
        coverage_report=engine_result.coverage_report,
        nasa_metadata_by_id=nasa_metadata_by_id,
    )

    rotation_scores: list[RotationScore] = []
    for ev in engine_result.evaluations:
        why = _build_why(ev, existing_eval, alternative_evals)
        benefits, risks = _build_benefits_and_risks(ev, existing_eval)
        data_gaps = _build_data_gaps(ev, profile, field, engine_result.coverage_report)
        evidence = _build_evidence(
            ev,
            field=field,
            raw_field_meta=raw_field_meta,
            profile=profile,
            nasa_metadata_by_id=nasa_metadata_by_id,
        )

        rotation_scores.append(
            RotationScore(
                rotation_id=ev.rotation_id,
                label=ev.label,
                strategy_type=ev.strategy_type,
                is_existing=ev.is_existing,
                scores=dict(ev.scores),
                overall=ev.overall,
                overall_low=ev.overall_low,
                overall_high=ev.overall_high,
                rank=ev.rank,
                confidence=ev.confidence,
                why=why,
                benefits=benefits,
                risks=risks,
                data_gaps=data_gaps,
                needs_local_review=list(shared_local_review),
                evidence=evidence,
            )
        )

    merged_quality = build_merged_data_quality(profile, engine_result.coverage_report)
    disclaimer = build_disclaimer(
        data_mode=profile.data_mode,
        scenario_applied=engine_result.scenario_applied,
        parameters_validated=engine_result.coverage_report.parameters_validated,
        scenario=scenario,
    )

    return CompareResponse(
        field_id=field.field_id,
        scenario_applied=engine_result.scenario_applied,
        rotations=rotation_scores,
        data_mode=profile.data_mode,
        data_quality=merged_quality,
        disclaimer=disclaimer,
    )
