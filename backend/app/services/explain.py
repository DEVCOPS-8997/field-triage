"""Plain-language, number-traceable explanations for every rotation (`explain.py`).

Everything a farmer reads is generated here from the engine's numbers and the location's data.
Each finding is an `Insight` (benefit / risk / gap / check) that names the authority behind it.
Rules:
  * no number is shown unless it was measured, computed, or taken from a cited source;
  * a data source that was not used is not mentioned (except as a gap when it matters);
  * wording is for farmers: short headline, one or two plain sentences, units explained.
The legacy string lists (`why`, `benefits`, `risks`, `data_gaps`, `needs_local_review`) are kept
for API compatibility and mirror the insights.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.models.schemas import (
    CompareResponse,
    EvidenceItem,
    FieldInfo,
    FieldProfile,
    Insight,
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
    "water": "Water fit",
    "soil": "Soil care",
    "resilience": "Weather safety",
    "income": "Crop income",
}

MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
HA_PER_ACRE = 0.404686
UREA_N_SHARE = 0.46  # urea is 46% nitrogen
UREA_BAG_KG = 50

# Authorities (label, url). URLs are only given where verified.
SRC_POWER = ("NASA POWER daily weather (MERRA-2 / CERES)", "https://power.larc.nasa.gov/")
SRC_FAO56 = ("FAO Irrigation and Drainage Paper 56 (Allen et al., 1998)", "https://www.fao.org/3/x0490e/x0490e00.htm")
SRC_ECOCROP = ("FAO EcoCrop and GAEZ v4 crop temperature limits", None)
SRC_NRCS_SH = (
    "USDA NRCS soil health principles",
    "https://www.nrcs.usda.gov/conservation-basics/natural-resource-concerns/soil/soil-health",
)
SRC_NRCS_328 = (
    "USDA NRCS Conservation Crop Rotation standard (Code 328)",
    "https://www.nrcs.usda.gov/sites/default/files/2022-09/Conservation_Crop_Rotation_328_CPS.pdf",
)
SRC_FAOSTAT = ("FAOSTAT producer prices and national yields (FAO)", "https://www.fao.org/faostat/en/#data")
SRC_SOILGRIDS = ("ISRIC SoilGrids 250 m", "https://soilgrids.org/")
SRC_SAXTON = ("Saxton and Rawls (2006) soil water equations, using SoilGrids texture", None)
SRC_DEM = ("Copernicus DEM GLO-30 (30 m)", None)
SRC_CALENDAR = ("Regional crop calendar (FAO-56 stage lengths)", SRC_FAO56[1])
SRC_FARMER = ("Your answers in the form", None)


def _ins(kind: str, topic: str, title: str, detail: str, src: tuple[str, str | None] | None = None) -> Insight:
    return Insight(
        kind=kind,  # type: ignore[arg-type]
        topic=topic,
        title=title,
        detail=detail,
        source=src[0] if src else None,
        source_url=src[1] if src else None,
    )


def _text(i: Insight) -> str:
    return f"{i.title}. {i.detail}"


def _join(names: list[str]) -> str:
    names = list(dict.fromkeys(names))
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _mm(v: float) -> str:
    """Water depth with the volume a farmer can picture (1 mm on 1 ha = 10 cubic metres)."""
    return f"{v:,.0f} mm (about {v * 10:,.0f} cubic metres per hectare)"


def _power_src(profile: FieldProfile) -> tuple[str, str | None]:
    return (f"{SRC_POWER[0]}, {profile.period_start[:4]}-{profile.period_end[:4]}", SRC_POWER[1])


def _crop_name(crops_by_id: dict[str, dict[str, Any]], cid: str) -> str:
    return str((crops_by_id.get(cid) or {}).get("name", cid))


# ---------------------------------------------------------------------------------------------
# Why (headline reasons)
# ---------------------------------------------------------------------------------------------
def _build_why(
    evaluation: RotationEvaluation,
    existing_eval: RotationEvaluation,
    alternative_evals: list[RotationEvaluation],
) -> list[str]:
    comps = [c for c in ("water", "soil", "resilience", "income") if c in evaluation.scores]

    if not evaluation.is_existing:
        diff = round(evaluation.overall - existing_eval.overall, 1)
        if abs(diff) < 0.5:
            head = f"Scores {evaluation.overall:.0f} out of 100, about the same as your current {existing_eval.label}."
        else:
            head = (
                f"Scores {evaluation.overall:.0f} out of 100, {abs(diff):.0f} points "
                f"{'higher' if diff > 0 else 'lower'} than your current {existing_eval.label} ({existing_eval.overall:.0f})."
            )
        lines = [head]
        deltas = sorted(
            ((c, evaluation.scores[c] - existing_eval.scores.get(c, evaluation.scores[c])) for c in comps),
            key=lambda x: (-abs(x[1]), comps.index(x[0])),
        )
        for comp, d in deltas[:2]:
            if abs(d) < 1:
                continue
            lines.append(
                f"{COMPONENT_LABELS[comp]} is {abs(d):.0f} points {'better' if d > 0 else 'worse'} "
                f"({evaluation.scores[comp]:.0f} vs {existing_eval.scores[comp]:.0f})."
            )
        return lines

    if not alternative_evals:
        return [f"Your current rotation scores {evaluation.overall:.0f} out of 100."]
    best_alt = min(alternative_evals, key=lambda a: a.rank)
    rel = []
    for c in comps:
        mean_alt = sum(a.scores[c] for a in alternative_evals) / len(alternative_evals)
        rel.append((c, evaluation.scores[c] - mean_alt))
    strong = max(rel, key=lambda x: x[1])
    weak = min(rel, key=lambda x: x[1])
    lines = [
        f"Your current rotation scores {evaluation.overall:.0f} out of 100 and ranks #{evaluation.rank}; "
        f"the best alternative, {best_alt.label}, scores {best_alt.overall:.0f}.",
    ]
    if strong[1] > 1:
        lines.append(f"Its strongest point is {COMPONENT_LABELS[strong[0]].lower()} ({evaluation.scores[strong[0]]:.0f}).")
    if weak[1] < -1:
        lines.append(f"Its weakest point is {COMPONENT_LABELS[weak[0]].lower()} ({evaluation.scores[weak[0]]:.0f}).")
    return lines


# ---------------------------------------------------------------------------------------------
# Benefits and risks
# ---------------------------------------------------------------------------------------------
def _season_failures(ev: RotationEvaluation, attr: str) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for se in ev.season_evaluations:
        if se.complete and getattr(se, attr) is False:
            out[se.crop_name] += 1
    return dict(out)


def _seasons_per_crop(ev: RotationEvaluation) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for se in ev.season_evaluations:
        if se.complete:
            out[se.crop_name] += 1
    return dict(out)


def _build_benefits_and_risks(
    ev: RotationEvaluation,
    existing: RotationEvaluation,
    *,
    profile: FieldProfile,
    field: FieldInfo,
    crops_by_id: dict[str, dict[str, Any]],
    income_scored: bool,
    market_meta: dict[str, Any] | None,
    country_name: str | None,
) -> list[Insight]:
    out: list[Insight] = []
    power = _power_src(profile)
    water_src = (f"{power[0]} + {SRC_FAO56[0]}", SRC_FAO56[1])

    # 1. Water -----------------------------------------------------------------------------
    supply = (
        f"rain that soaks in ({ev.mean_effective_rain_mm:,.0f} mm), water already stored in the soil "
        f"({ev.soil_water_mm:,.0f} mm) and your irrigation ({ev.irrigation_mm:,.0f} mm)"
    )
    if ev.mean_water_deficit_mm <= 40:
        out.append(_ins(
            "benefit", "water", "Enough water for these crops",
            f"On average the crops need {_mm(ev.mean_water_demand_mm)} per season. {supply.capitalize()} "
            f"leave only {ev.mean_water_deficit_mm:,.0f} mm short.",
            water_src,
        ))
    elif ev.mean_water_deficit_mm > 100:
        out.append(_ins(
            "risk", "water", "Crops would run short of water",
            f"The crops need about {ev.mean_water_demand_mm:,.0f} mm per season, but {supply} still leave about "
            f"{_mm(ev.mean_water_deficit_mm)} short. Plan extra irrigation or a crop that needs less water.",
            water_src,
        ))
    if not ev.is_existing:
        d = ev.mean_water_deficit_mm - existing.mean_water_deficit_mm
        if d <= -25:
            out.append(_ins(
                "benefit", "water", "Needs less water than your current rotation",
                f"About {abs(d):,.0f} mm less shortfall per season than {existing.label} "
                f"({ev.mean_water_deficit_mm:,.0f} mm vs {existing.mean_water_deficit_mm:,.0f} mm).",
                water_src,
            ))
        elif d >= 25:
            out.append(_ins(
                "risk", "water", "Needs more water than your current rotation",
                f"About {d:,.0f} mm more shortfall per season than {existing.label} "
                f"({ev.mean_water_deficit_mm:,.0f} mm vs {existing.mean_water_deficit_mm:,.0f} mm).",
                water_src,
            ))

    # 2. Weather record: heat, frost, water failures ------------------------------------------
    total = ev.evaluated_seasons_count
    per_crop = _seasons_per_crop(ev)
    climate_src = (f"{power[0]} + {SRC_ECOCROP[0]}", power[1])
    if total and ev.viable_seasons_count / total >= 0.85:
        out.append(_ins(
            "benefit", "climate", "Came through most past seasons",
            f"Replaying the last {profile.n_years} years of NASA weather for this spot, the crops would have "
            f"come through {ev.viable_seasons_count} of {total} seasons without heat, frost or water failure.",
            climate_src,
        ))
    for attr, topic, title, why in (
        ("heat_ok", "heat", "Too hot at flowering in some years", "days around flowering and grain filling were hotter than the crop can handle"),
        ("frost_ok", "frost", "Frost hit the growing crop in some years", "frost fell while the crop was growing"),
        ("water_ok", "water", "Not enough water in some years", "the crop got less than its minimum share of the water it needs"),
    ):
        fails = _season_failures(ev, attr)
        if not fails:
            continue
        parts = [f"{crop}: {n} of {per_crop.get(crop, n)} seasons" for crop, n in fails.items()]
        out.append(_ins("risk", topic, title, f"In the NASA weather record, {why} ({'; '.join(parts)}).", climate_src))

    # 3. Nitrogen from legumes ---------------------------------------------------------------
    crop_ids = list(ev.sequence_crop_ids) + ([ev.cover_crop_id] if ev.cover_crop_id else [])
    legumes = [crops_by_id[c] for c in crop_ids if c in crops_by_id and crops_by_id[c].get("type") in ("legume", "fodder") and crops_by_id[c].get("n_fix_sources")]
    for crop in legumes:
        n = float(crop.get("n_fix_kg_ha") or 0)
        srcs = crop.get("n_fix_sources") or []
        src = (srcs[0]["label"], srcs[0].get("url")) if srcs else None
        if n > 0:
            bags = n / UREA_N_SHARE / UREA_BAG_KG
            rng = crop.get("n_fix_range_kg_ha")
            rng_txt = f" Field studies found {rng[0]}-{rng[1]} kg." if isinstance(rng, list) else ""
            out.append(_ins(
                "benefit", "nitrogen", f"{crop['name']} feeds the soil with nitrogen",
                f"{crop['name']} leaves about {n:.0f} kg of nitrogen per hectare ({n * HA_PER_ACRE:.0f} kg per acre) "
                f"for the next crop, roughly {bags:.1f} bags of urea per hectare you may be able to save.{rng_txt} "
                "Confirm with a soil test before cutting fertiliser.",
                src,
            ))
        else:
            out.append(_ins("check", "nitrogen", f"{crop['name']} adds little nitrogen overall", str(crop.get("n_fix_note", "")), src))
    if not legumes:
        out.append(_ins(
            "risk", "nitrogen", "No crop in this rotation adds nitrogen",
            "None of these crops is a legume, so all nitrogen has to come from fertiliser or manure.",
            SRC_NRCS_SH,
        ))

    # 4. Living roots / bare soil ------------------------------------------------------------
    bare_months = round(ev.bare_fraction * ev.cycle_months)
    cover_src = (f"{SRC_CALENDAR[0]} + {SRC_NRCS_SH[0]}", SRC_NRCS_SH[1])
    site_bits = []
    if ev.slope_deg_used is not None:
        site_bits.append(f"a slope of {ev.slope_deg_used:.1f} degrees")
    if ev.heavy_rain_days_used is not None:
        site_bits.append(f"about {ev.heavy_rain_days_used:.1f} days a year with 25 mm or more of rain")
    site_txt = f" This spot has {_join(site_bits)} (NASA POWER, Copernicus DEM)." if site_bits else ""
    if ev.cover_crop_id:
        cut = max(0.0, ev.calendar_bare_fraction_without_cover - ev.calendar_bare_fraction) * ev.cycle_months
        out.append(_ins(
            "benefit", "cover", "Cover crop protects the soil between crops",
            f"{_crop_name(crops_by_id, ev.cover_crop_id)} keeps the ground covered for about {cut:.0f} more months "
            f"of the {ev.cycle_months}-month cycle.{site_txt}",
            cover_src,
        ))
    if bare_months >= 3:
        out.append(_ins(
            "risk", "cover", f"Field left bare for about {bare_months} months",
            f"With the usual sowing and harvest dates, nothing grows for about {bare_months} of every "
            f"{ev.cycle_months} months. Bare soil washes and blows away and feeds no soil life.{site_txt}",
            cover_src,
        ))
    elif not ev.cover_crop_id:
        out.append(_ins(
            "benefit", "cover", "Something is growing almost all year",
            f"Crops cover the field for about {ev.cycle_months - bare_months} of every {ev.cycle_months} months. "
            f"Living roots feed soil life and hold the soil in place.{site_txt}",
            cover_src,
        ))

    # 5. Pest and disease break --------------------------------------------------------------
    seq = [crops_by_id[c] for c in ev.sequence_crop_ids if c in crops_by_id]
    fams = [str(c.get("pest_family", "")).strip().lower() for c in seq]
    same_pairs = [
        (seq[i]["name"], seq[(i + 1) % len(seq)]["name"])
        for i in range(len(seq))
        if len(seq) > 1 and fams[i] and fams[i] == fams[(i + 1) % len(seq)]
    ]
    family_names = {"poaceae": "grass family (cereals)", "fabaceae": "legume family", "malvaceae": "mallow family (cotton)"}
    if seq and not same_pairs and len(seq) > 1:
        out.append(_ins(
            "benefit", "pest", "Breaks pest and disease cycles",
            "Each crop is from a different plant family than the one before it ("
            + _join([f"{c['name']}: {family_names.get(f, f)}" for c, f in zip(seq, fams)])
            + "), so pests and diseases that live on one crop find little to feed on next.",
            SRC_NRCS_328,
        ))
    elif same_pairs:
        a, b = same_pairs[0]
        fam = family_names.get(fams[0], fams[0])
        out.append(_ins(
            "risk", "pest", "Same plant family back to back",
            f"{a} and {b} are both in the {fam}, so pests, diseases and weeds can carry over from one crop to the next.",
            SRC_NRCS_328,
        ))

    # 6. Income ------------------------------------------------------------------------------
    if income_scored and ev.annual_value_usd_ha is not None:
        years = ""
        if market_meta:
            years = f" ({market_meta.get('source_years', '')})" if market_meta.get("source_years") else ""
        value_txt = (
            f"Using {country_name or 'national'} average yields and farm-gate prices from FAOSTAT{years}, and counting "
            f"only the seasons that worked at this spot, this rotation brings in about ${ev.annual_value_usd_ha:,.0f} per "
            f"hectare (${ev.annual_value_usd_ha * HA_PER_ACRE:,.0f} per acre) a year in crop sales, before costs."
        )
        if ev.is_existing:
            out.append(_ins("check", "income", "Expected crop sales", value_txt, SRC_FAOSTAT))
        elif existing.annual_value_usd_ha:
            ratio = ev.annual_value_usd_ha / existing.annual_value_usd_ha - 1
            if ratio >= 0.1:
                out.append(_ins("benefit", "income", f"About {ratio:.0%} more crop sales than now", value_txt, SRC_FAOSTAT))
            elif ratio <= -0.1:
                out.append(_ins("risk", "income", f"About {abs(ratio):.0%} less crop sales than now", value_txt, SRC_FAOSTAT))
            else:
                out.append(_ins("check", "income", "Similar crop sales to now", value_txt, SRC_FAOSTAT))
    return out


# ---------------------------------------------------------------------------------------------
# Data gaps (what the analysis could not see) - dynamic per location and rotation
# ---------------------------------------------------------------------------------------------
def _build_gaps(
    ev: RotationEvaluation,
    profile: FieldProfile,
    field: FieldInfo,
    coverage_report: PillarCoverageReport,
    income_status: dict[str, Any] | None,
) -> list[Insight]:
    gaps: list[Insight] = []
    if profile.data_mode == "demo":
        gaps.append(_ins("gap", "data", "Demonstration data", "These results use a synthetic test profile, not NASA measurements."))
    if coverage_report.pillar_quality.get("soil") == "unavailable":
        gaps.append(_ins(
            "gap", "soil", "No soil data for this spot",
            "SoilGrids returned nothing here, so water stored in the soil was counted as zero. Water shortages may look worse than they are.",
            SRC_SOILGRIDS,
        ))
    if coverage_report.pillar_quality.get("terrain") == "unavailable":
        gaps.append(_ins(
            "gap", "terrain", "Slope unknown",
            "No elevation data came back, so the erosion check could not include the slope of the land.",
            SRC_DEM,
        ))
    if coverage_report.missing_climate_months > 0:
        gaps.append(_ins(
            "gap", "climate", f"{coverage_report.missing_climate_months} months of weather missing",
            "Some months in the NASA record have no rain or temperature values. They were left out, never filled with zeros.",
            SRC_POWER,
        ))
    if ev.incomplete_season_count > 0:
        gaps.append(_ins(
            "gap", "climate", f"{ev.incomplete_season_count} past seasons could not be checked",
            "These seasons fall on months with missing weather data, so they are not counted in the scores.",
            SRC_POWER,
        ))
    if ev.water_demand_source != "fao56_kc_eto":
        gaps.append(_ins(
            "gap", "water", "Crop water need is a textbook figure",
            "Daily evaporation data was incomplete, so a standard seasonal water need was used instead of one worked out from this spot's weather.",
            SRC_FAO56,
        ))
    if income_status and not income_status.get("scored"):
        missing = list(ev.market_missing)
        who = f"{_join(missing)} in this rotation" if missing else "some of the other rotations compared"
        gaps.append(_ins(
            "gap", "income", "Income not compared",
            f"FAOSTAT has no recent price or yield for {who}, so no rotation gets an income score. Its share of your "
            "priorities was spread over water, soil and weather safety. Check prices at your local market.",
            SRC_FAOSTAT,
        ))
    return gaps


# ---------------------------------------------------------------------------------------------
# Local checks (what a farmer or adviser should confirm) - dynamic
# ---------------------------------------------------------------------------------------------
def _build_checks(
    ev: RotationEvaluation,
    field: FieldInfo,
    profile: FieldProfile,
    parameters: dict[str, Any],
    coverage_report: PillarCoverageReport,
    crops_by_id: dict[str, dict[str, Any]],
    region_name: str | None,
) -> list[Insight]:
    checks: list[Insight] = []
    dates = []
    for cid in list(ev.sequence_crop_ids) + ([ev.cover_crop_id] if ev.cover_crop_id else []):
        cal = ((crops_by_id.get(cid) or {}).get("calendars") or {}).get(field.region_id) or {}
        if cal.get("sow_month") and cal.get("harvest_month"):
            dates.append(f"{_crop_name(crops_by_id, cid)} sown in {MONTHS[cal['sow_month'] - 1]}, harvested in {MONTHS[cal['harvest_month'] - 1]}")
    if dates:
        checks.append(_ins(
            "check", "farm", "Confirm your sowing dates",
            f"Scores assume {_join(dates)}, typical for {region_name or 'this region'}. Different dates change the heat, frost and water results.",
            SRC_CALENDAR,
        ))
    irr_mm = float(parameters["irrigation_mm"][field.irrigation])
    checks.append(_ins(
        "check", "water", "Confirm your water supply",
        f"You chose irrigation '{field.irrigation}', which adds {irr_mm:.0f} mm of water per season in this analysis."
        + (" Canal or tubewell water you do have would make shortages smaller." if irr_mm == 0 else ""),
        SRC_FARMER,
    ))
    if profile.data_mode == "observed" and profile.monthly:
        checks.append(_ins(
            "check", "climate", "Weather is for the wider area",
            "NASA POWER describes a grid square of about 50 x 50 km around your pin, not your exact field. "
            "Low spots, shade and canal seepage can make your field wetter or cooler.",
            SRC_POWER,
        ))
    if coverage_report.pillar_quality.get("soil") not in (None, "unavailable"):
        ph = profile.soil.get("soil_ph")
        extra = ""
        if is_valid_number(ph) and float(ph) >= 8.5:
            extra = f" The estimated pH is {float(ph):.1f} (strongly alkaline): test for salt and sodium, which hurt legumes, rice and wheat."
        elif is_valid_number(ph) and float(ph) < 5.5:
            extra = f" The estimated pH is {float(ph):.1f} (acidic): lime may be needed, and legumes fix less nitrogen below about pH 5.5."
        checks.append(_ins(
            "check", "soil", "Get a soil test",
            "Soil values here are computer estimates for 250 m squares, not a lab test of your field." + extra,
            SRC_SOILGRIDS,
        ))
    legumes = [crops_by_id[c]["name"] for c in ev.sequence_crop_ids if (crops_by_id.get(c) or {}).get("n_fix_kg_ha")]
    if legumes:
        checks.append(_ins(
            "check", "nitrogen", "Nitrogen from legumes varies",
            f"How much nitrogen {_join(legumes)} leaves depends on seed inoculation, phosphorus, and how much is cut or grazed.",
            SRC_NRCS_SH,
        ))
    if parameters.get("validated") is not True:
        checks.append(_ins(
            "check", "data", "Ask a local agronomist",
            "The pass/fail limits for water, heat and frost come from FAO references but have not yet been checked for your district.",
            SRC_ECOCROP,
        ))
    if is_valid_number(profile.climatology.get("gwetroot_mean")):
        checks.append(_ins(
            "check", "soil", "Soil wetness is a model value",
            "Root-zone wetness comes from NASA's MERRA-2 model, not a sensor in your field. A simple hand or probe check tells you more.",
            SRC_POWER,
        ))
    return checks


# ---------------------------------------------------------------------------------------------
# Evidence (every number behind the scores, grouped)
# ---------------------------------------------------------------------------------------------
def _ev(variable: str, label: str, group: str, value: Any, unit: str, src: tuple[str, str | None], meaning: str) -> EvidenceItem:
    return EvidenceItem(
        variable=variable, label=label, group=group, value=value, unit=unit,
        source=src[0], source_url=src[1], interpretation=meaning,
    )


def _build_evidence(
    ev: RotationEvaluation,
    field: FieldInfo,
    profile: FieldProfile,
    crops_by_id: dict[str, dict[str, Any]],
    market_crops: dict[str, Any] | None,
    income_scored: bool,
    current_label: str | None = None,
) -> list[EvidenceItem]:
    clim = profile.climatology
    power = _power_src(profile)
    out: list[EvidenceItem] = []

    def num(key: str) -> float | None:
        v = clim.get(key)
        return float(v) if is_valid_number(v) else None

    rain = num("rain_annual_mm_mean")
    if rain is not None:
        out.append(_ev("rain_annual_mm_mean", "Yearly rain", "climate", round(rain), "mm/year", power,
                       f"Average rain per year over {profile.n_years} years."))
    eto = num("eto_annual_mm_mean")
    if eto is not None:
        ai = num("aridity_index_p_over_eto")
        out.append(_ev("eto_annual_mm_mean", "Water the air pulls out", "climate", round(eto), "mm/year",
                       (f"{power[0]} + {SRC_FAO56[0]}", SRC_FAO56[1]),
                       "How much water a grass field would lose to sun, heat and wind in a year"
                       + (f"; rain covers {ai:.0%} of it." if ai is not None else ".")))
    heavy = num("heavy_rain_days_ge_25mm_mean")
    if heavy is not None:
        out.append(_ev("heavy_rain_days_ge_25mm_mean", "Heavy-rain days", "climate", round(heavy, 1), "days/year", power,
                       "Days with 25 mm or more of rain; these wash bare soil away."))
    gw = num("gwetroot_mean")
    if gw is not None:
        out.append(_ev("gwetroot_mean", "Root-zone wetness", "climate", round(gw, 2), "0-1", power,
                       "Model estimate of how wet the root zone usually is (0 dry, 1 soaked). Background only, not scored."))

    out.append(_ev("mean_season_water_demand_mm", "Crop water need", "water", round(ev.mean_water_demand_mm), "mm/season",
                   (f"{power[0]} + {SRC_FAO56[0]}", SRC_FAO56[1]),
                   "Water the crops use in an average season, worked out from this spot's daily weather."
                   if ev.water_demand_source == "fao56_kc_eto" else "Standard seasonal water need for these crops."))
    out.append(_ev("mean_effective_rain_mm", "Rain that soaks in", "water", round(ev.mean_effective_rain_mm), "mm/season",
                   (f"{power[0]} + USDA-SCS effective rain method", SRC_FAO56[1]),
                   f"Part of the {ev.mean_season_rain_mm:,.0f} mm season rain that stays in the root zone."))
    if ev.soil_awc_m3m3 is not None:
        out.append(_ev("soil_water_mm", "Water stored in soil at sowing", "water", round(ev.soil_water_mm), "mm", SRC_SAXTON,
                       "Assumes the root zone is half full at sowing."))
    out.append(_ev("mean_season_water_deficit_mm", "Water still short", "water", round(ev.mean_water_deficit_mm), "mm/season",
                   (f"{power[0]} + {SRC_FAO56[0]}", SRC_FAO56[1]),
                   f"Need minus soaked-in rain, stored soil water and {ev.irrigation_mm:.0f} mm irrigation."))

    if field.soil_type:
        out.append(_ev("soil_texture", "Soil type", "soil", field.soil_type, "USDA class", SRC_SOILGRIDS,
                       "From the sand, silt and clay estimate for the top 30 cm."))
    if ev.soil_awc_m3m3 is not None:
        out.append(_ev("soil_awc_m3m3", "Water the soil can hold for plants", "soil", round(ev.soil_awc_m3m3 * 1000), "mm per metre",
                       SRC_SAXTON, "Higher means the soil carries crops longer between rains."))
    for key, label, unit, meaning in (
        ("soil_soc_g_kg", "Organic carbon", "g/kg", "More carbon usually means better structure and more nutrients."),
        ("soil_ph", "Soil pH", "pH", "7 is neutral; above 8.5 is strongly alkaline, below 5.5 acidic."),
    ):
        v = profile.soil.get(key)
        if is_valid_number(v):
            out.append(_ev(key, label, "soil", round(float(v), 1), unit, SRC_SOILGRIDS, meaning))

    if ev.slope_deg_used is not None:
        out.append(_ev("slope_deg", "Slope", "terrain", round(ev.slope_deg_used, 1), "degrees", SRC_DEM,
                       "Steeper land loses more soil when it is bare."))
    elev = profile.terrain.get("elevation_m")
    if is_valid_number(elev):
        out.append(_ev("elevation_m", "Height above sea level", "terrain", round(float(elev)), "m", SRC_DEM,
                       "Used for the air-pressure part of the water calculation."))

    total = ev.evaluated_seasons_count
    if total:
        out.append(_ev("season_viability_rate", "Seasons that worked", "crop", round(100 * ev.viable_seasons_count / total), "%",
                       (f"{power[0]} + {SRC_ECOCROP[0]}", power[1]),
                       f"{ev.viable_seasons_count} of {total} past seasons passed the heat, frost and water checks."))
    out.append(_ev("living_root_share", "Months with a living crop", "crop",
                   round(ev.living_root_share * ev.cycle_months), f"of {ev.cycle_months} months", SRC_CALENDAR,
                   "Longer living cover feeds soil life and protects the surface (NRCS soil health principles)."))
    out.append(_ev("total_n_fix_kg_ha", "Nitrogen left by legumes", "crop", round(ev.total_n_fix_kg_ha), "kg/ha per cycle",
                   ("Field studies cited in the crop catalogue", None),
                   "Net nitrogen the legume crops leave for the next crop."))

    if income_scored and ev.annual_value_usd_ha is not None:
        out.append(_ev("annual_value_usd_ha", "Expected crop sales", "market", round(ev.annual_value_usd_ha), "USD/ha/year",
                       SRC_FAOSTAT, "National yield x farm-gate price x share of seasons that worked here, per year, before costs."))
        for cid in dict.fromkeys(ev.sequence_crop_ids):
            m = (market_crops or {}).get(cid) or {}
            if is_valid_number(m.get("yield_kg_ha")) and is_valid_number(m.get("price_usd_t")):
                yrs = m.get("price_years") or []
                out.append(_ev(f"market_{cid}", f"{_crop_name(crops_by_id, cid)} yield and price", "market",
                               f"{m['yield_kg_ha'] / 1000:.1f} t/ha at ${m['price_usd_t']:,.0f}/t", "national average", SRC_FAOSTAT,
                               f"FAOSTAT average of {yrs[0]}-{yrs[-1]}." if yrs else "FAOSTAT."))

    out.append(_ev("irrigation", "Your irrigation", "farm", field.irrigation, "", SRC_FARMER,
                   f"Adds {ev.irrigation_mm:.0f} mm per season in the water check."))
    out.append(_ev("current_rotation_id", "Your current rotation", "farm", current_label or field.current_rotation_id, "", SRC_FARMER,
                   "Used as the baseline every option is compared with."))
    return out


# ---------------------------------------------------------------------------------------------
# Data quality, disclaimer, response
# ---------------------------------------------------------------------------------------------
def build_merged_data_quality(profile: FieldProfile, coverage_report: PillarCoverageReport) -> dict[str, Quality]:
    merged: dict[str, Quality] = {}
    for key, val in profile.data_quality.items():
        merged[key] = "demo" if profile.data_mode == "demo" and val in ("observed", "derived") else val
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
    parts = ["This tool supports, and does not replace, your own judgement and your local agricultural adviser."]
    if data_mode == "demo":
        parts.append("These results use demonstration data, not NASA measurements.")
    if not parameters_validated:
        parts.append("The pass/fail limits have not yet been checked for your district.")
    if scenario_applied and scenario is not None:
        parts.append(
            f"A 'what if' change is applied (rain x{scenario.rain_multiplier:.2f}, temperature +{scenario.temp_delta_c:.1f} C); "
            "it is a test, not a NASA forecast."
        )
    return " ".join(parts)


def build_income_status(
    engine_result: EngineComparisonResult, market: dict[str, Any] | None, country_name: str | None
) -> dict[str, Any]:
    evals = engine_result.evaluations
    scored = bool(evals) and all(ev.income_scored for ev in evals)
    missing = sorted({name for ev in evals for name in ev.market_missing})
    if scored:
        note = (
            f"Income compares expected crop sales per hectare per year, from {country_name or 'national'} average yields and "
            "farm-gate prices (FAOSTAT), counting only the seasons that worked at this spot. Costs are not included."
        )
    elif market is None:
        note = "No market data file is installed, so income is not scored."
    else:
        note = (
            f"FAOSTAT has no recent price or yield for {_join(missing) or 'some crops'} in {country_name or 'this country'}, "
            "so income is not scored. Its weight was shared over the other three scores."
        )
    return {
        "scored": scored,
        "note": note,
        "missing": missing,
        "source": SRC_FAOSTAT[0],
        "source_url": SRC_FAOSTAT[1],
        "retrieved_at": (market or {}).get("retrieved_at"),
    }


def build_compare_response(
    *,
    engine_result: EngineComparisonResult,
    field: FieldInfo,
    raw_field_meta: dict[str, Any],
    profile: FieldProfile,
    parameters: dict[str, Any],
    nasa_metadata_by_id: dict[str, dict[str, Any]],
    scenario: Scenario | None = None,
    crops_by_id: dict[str, dict[str, Any]] | None = None,
    market: dict[str, Any] | None = None,
    market_crops: dict[str, Any] | None = None,
    country_name: str | None = None,
    region_name: str | None = None,
) -> CompareResponse:
    crops_by_id = crops_by_id or {}
    existing = next(ev for ev in engine_result.evaluations if ev.is_existing)
    alternatives = [ev for ev in engine_result.evaluations if not ev.is_existing]
    income_status = build_income_status(engine_result, market, country_name)
    income_scored = bool(income_status["scored"])
    years = sorted({y for m in (market_crops or {}).values() for y in (m.get("price_years") or [])})
    market_meta = {"source_years": f"{years[0]}-{years[-1]}"} if years else None

    rotation_scores: list[RotationScore] = []
    for ev in engine_result.evaluations:
        why = _build_why(ev, existing, alternatives)
        br = _build_benefits_and_risks(
            ev, existing, profile=profile, field=field, crops_by_id=crops_by_id,
            income_scored=income_scored, market_meta=market_meta, country_name=country_name,
        )
        gaps = _build_gaps(ev, profile, field, engine_result.coverage_report, income_status)
        checks = _build_checks(ev, field, profile, parameters, engine_result.coverage_report, crops_by_id, region_name)
        insights = br + gaps + checks
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
                benefits=[_text(i) for i in br if i.kind == "benefit"],
                risks=[_text(i) for i in br if i.kind == "risk"],
                data_gaps=[_text(i) for i in gaps],
                needs_local_review=[_text(i) for i in checks + [i for i in br if i.kind == "check"]],
                evidence=_build_evidence(ev, field, profile, crops_by_id, market_crops, income_scored, existing.label),
                insights=insights,
                annual_value_usd_ha=ev.annual_value_usd_ha if income_scored else None,
            )
        )

    return CompareResponse(
        field_id=field.field_id,
        scenario_applied=engine_result.scenario_applied,
        rotations=rotation_scores,
        data_mode=profile.data_mode,
        data_quality=build_merged_data_quality(profile, engine_result.coverage_report),
        disclaimer=build_disclaimer(
            data_mode=profile.data_mode,
            scenario_applied=engine_result.scenario_applied,
            parameters_validated=engine_result.coverage_report.parameters_validated,
            scenario=scenario,
        ),
        income_status=income_status,
    )


# Kept for imports elsewhere; source labels now come from the constants above.
def _resolve_source_label(pillar: str, profile: FieldProfile, nasa_metadata_by_id: dict[str, dict[str, Any]]) -> str:
    meta_id = PILLAR_TO_METADATA_ID.get(pillar, pillar)
    explicit = profile.data_sources.get(pillar) or profile.data_sources.get(meta_id)
    meta_entry = nasa_metadata_by_id.get(meta_id)
    return explicit or (str(meta_entry["name"]) if meta_entry and "name" in meta_entry else pillar.upper())
