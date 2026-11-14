"""Input, dataset, calendar, and regional compatibility validation for Field Shift Advisor."""

from __future__ import annotations

import math
from typing import Any

from pydantic import ValidationError

from app.models.schemas import FieldInfo, Priorities, Scenario


class FieldShiftError(Exception):
    """Base exception for deterministic backend validation and loading failures."""


class UnknownFieldError(FieldShiftError):
    """Raised when a requested field_id does not exist in fields.json (HTTP 404)."""


class RequestValidationError(FieldShiftError):
    """Raised when request inputs or candidate selections are invalid (HTTP 422)."""


class ProfileUnavailableError(FieldShiftError):
    """Raised when a required field profile is missing or unreadable (HTTP 503)."""


class DatasetIntegrityError(FieldShiftError):
    """Raised when server-side domain configuration/datasets are malformed (HTTP 503)."""


def is_valid_number(value: Any) -> bool:
    """Return True iff value is a finite int/float (excluding bool and None)."""
    if value is None or isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return math.isfinite(float(value))
    return False


def validate_field_exists(
    field_id: str,
    fields_by_id: dict[str, FieldInfo],
) -> FieldInfo:
    """Verify field_id exists in the loaded field catalog; raise UnknownFieldError (404) otherwise."""
    cleaned = field_id.strip() if isinstance(field_id, str) else ""
    if not cleaned or cleaned not in fields_by_id:
        raise UnknownFieldError(f"Unknown field_id '{field_id}'.")
    return fields_by_id[cleaned]


def validate_priorities(priorities: Priorities | dict[str, Any]) -> Priorities:
    """Validate and normalize farmer priority weights (non-negative, finite, sum == 1.0 ± 0.01)."""
    try:
        if isinstance(priorities, Priorities):
            return Priorities.model_validate(priorities.model_dump())
        return Priorities.model_validate(priorities)
    except ValidationError as exc:
        raise RequestValidationError(f"Invalid priority weights: {exc}") from exc


def validate_scenario(scenario: Scenario | dict[str, Any]) -> Scenario:
    """Validate climate perturbation scenario bounds."""
    try:
        if isinstance(scenario, Scenario):
            return Scenario.model_validate(scenario.model_dump())
        return Scenario.model_validate(scenario)
    except ValidationError as exc:
        raise RequestValidationError(f"Invalid scenario parameters: {exc}") from exc


def validate_crop_calendar(crop: dict[str, Any], region_id: str) -> tuple[int, int]:
    """Validate and return (sow_month, harvest_month) for a crop in a given region."""
    crop_id = crop.get("crop_id", "<unknown>")
    calendars = crop.get("calendars")
    if not isinstance(calendars, dict) or region_id not in calendars:
        raise RequestValidationError(
            f"Crop '{crop_id}' has no growing calendar configured for region '{region_id}'."
        )
    cal = calendars[region_id]
    if not isinstance(cal, dict):
        raise RequestValidationError(
            f"Malformed calendar entry for crop '{crop_id}' in region '{region_id}'."
        )
    sow_month = cal.get("sow_month")
    harvest_month = cal.get("harvest_month")
    if (
        not isinstance(sow_month, int)
        or isinstance(sow_month, bool)
        or not isinstance(harvest_month, int)
        or isinstance(harvest_month, bool)
        or not (1 <= sow_month <= 12)
        or not (1 <= harvest_month <= 12)
    ):
        raise RequestValidationError(
            f"Invalid calendar months for crop '{crop_id}' in region '{region_id}': "
            f"sow_month={sow_month}, harvest_month={harvest_month}."
        )
    return sow_month, harvest_month


def validate_rotation_definition(
    rotation: dict[str, Any],
    region_id: str,
    crops_by_id: dict[str, dict[str, Any]],
) -> None:
    """Ensure a rotation belongs to region_id and all sequence/cover crops have valid calendars."""
    rot_id = rotation.get("rotation_id", "<unknown>")
    rot_region = rotation.get("region_id")
    if rot_region != region_id:
        raise RequestValidationError(
            f"Rotation '{rot_id}' belongs to region '{rot_region}', which is incompatible "
            f"with field region '{region_id}'."
        )

    sequence = rotation.get("sequence")
    if not isinstance(sequence, list) or len(sequence) == 0:
        raise RequestValidationError(
            f"Rotation '{rot_id}' must define a non-empty crop sequence."
        )

    for crop_id in sequence:
        if crop_id not in crops_by_id:
            raise RequestValidationError(
                f"Rotation '{rot_id}' references unknown crop_id '{crop_id}'."
            )
        crop = crops_by_id[crop_id]
        if not is_valid_number(crop.get("water_need_mm")) or float(crop["water_need_mm"]) <= 0:
            raise RequestValidationError(
                f"Crop '{crop_id}' must have a positive water_need_mm."
            )
        validate_crop_calendar(crop, region_id)

    cover_crop_id = rotation.get("cover_crop")
    if cover_crop_id is not None:
        if crop_id_str := str(cover_crop_id):
            if crop_id_str not in crops_by_id:
                raise RequestValidationError(
                    f"Rotation '{rot_id}' references unknown cover_crop '{crop_id_str}'."
                )
            validate_crop_calendar(crops_by_id[crop_id_str], region_id)


def select_and_validate_candidate_rotations(
    field: FieldInfo,
    rotations: list[dict[str, Any]],
    crops_by_id: dict[str, dict[str, Any]],
    requested_rotation_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Resolve and validate >= 3 regional candidate rotations, always including field.current_rotation_id.

    Rules:
    - `is_existing` is strictly `rotation['rotation_id'] == field.current_rotation_id`.
    - Default mode (`requested_rotation_ids is None`):
      Includes the field's actual `current_rotation_id` plus all regional alternatives whose
      `strategy_type != 'existing'` (preventing another field's current rotation from being injected).
    - Custom mode (`requested_rotation_ids is not None`):
      Validates all requested IDs exist and match `field.region_id`, automatically includes
      `field.current_rotation_id` if omitted, deduplicates preserving order, and rejects `< 3` candidates.
    """
    rotations_by_id: dict[str, dict[str, Any]] = {
        r["rotation_id"]: r for r in rotations if "rotation_id" in r
    }

    current_id = field.current_rotation_id
    if current_id not in rotations_by_id:
        raise DatasetIntegrityError(
            f"Field '{field.field_id}' current_rotation_id '{current_id}' is missing from rotations.json."
        )
    current_rotation = rotations_by_id[current_id]
    validate_rotation_definition(current_rotation, field.region_id, crops_by_id)

    selected: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    if requested_rotation_ids is None:
        selected.append(current_rotation)
        seen_ids.add(current_id)
        for rot in rotations:
            rid = rot.get("rotation_id")
            if (
                not rid
                or rid in seen_ids
                or rot.get("region_id") != field.region_id
                or rot.get("strategy_type") == "existing"
            ):
                continue
            validate_rotation_definition(rot, field.region_id, crops_by_id)
            selected.append(rot)
            seen_ids.add(rid)
    else:
        if len(requested_rotation_ids) == 0:
            raise RequestValidationError(
                "rotation_ids cannot be an empty list; omit rotation_ids or provide at least 3 valid IDs."
            )
        # Validate every requested ID first before auto-including current_rotation_id
        validated_requested: list[dict[str, Any]] = []
        for raw_id in requested_rotation_ids:
            if not isinstance(raw_id, str) or not raw_id.strip():
                raise RequestValidationError("rotation_ids entries must be non-empty strings.")
            rid = raw_id.strip()
            if rid not in rotations_by_id:
                raise RequestValidationError(f"Unknown rotation_id '{rid}'.")
            rot = rotations_by_id[rid]
            validate_rotation_definition(rot, field.region_id, crops_by_id)
            validated_requested.append(rot)

        # Always guarantee the field's actual current rotation is included
        if all(r["rotation_id"] != current_id for r in validated_requested):
            selected.append(current_rotation)
            seen_ids.add(current_id)

        for rot in validated_requested:
            rid = rot["rotation_id"]
            if rid not in seen_ids:
                selected.append(rot)
                seen_ids.add(rid)

    if len(selected) < 3:
        raise RequestValidationError(
            f"Comparison requires at least 3 regionally compatible rotations (including '{current_id}'); "
            f"got {len(selected)}."
        )

    return selected


def validate_parameters_dict(parameters: dict[str, Any]) -> None:
    """Validate required scoring parameters and positive denominators in parameters.json."""
    if not isinstance(parameters, dict):
        raise DatasetIntegrityError("parameters.json root must be a JSON object.")

    required_positive = ("water_gap_ref_mm", "n_ref_kg_ha", "heavy_ref_days")
    for key in required_positive:
        val = parameters.get(key)
        if not is_valid_number(val) or float(val) <= 0.0:
            raise DatasetIntegrityError(
                f"Parameter '{key}' in parameters.json must be a positive finite number (got {val!r})."
            )

    vwf = parameters.get("viable_water_fraction")
    if not is_valid_number(vwf) or not (0.0 < float(vwf) <= 1.5):
        raise DatasetIntegrityError(
            f"Parameter 'viable_water_fraction' must be in (0, 1.5] (got {vwf!r})."
        )

    irrig = parameters.get("irrigation_mm")
    if not isinstance(irrig, dict):
        raise DatasetIntegrityError("Parameter 'irrigation_mm' must be a mapping.")
    for tier in ("none", "limited", "reliable"):
        if tier not in irrig or not is_valid_number(irrig[tier]) or float(irrig[tier]) < 0.0:
            raise DatasetIntegrityError(
                f"Parameter 'irrigation_mm.{tier}' must be a non-negative number."
            )

    buckets = parameters.get("heat_buckets_c")
    if (
        not isinstance(buckets, list)
        or len(buckets) == 0
        or not all(is_valid_number(b) for b in buckets)
    ):
        raise DatasetIntegrityError(
            "Parameter 'heat_buckets_c' must be a non-empty list of numbers."
        )

    soil_weights = parameters.get("soil_weights")
    if not isinstance(soil_weights, dict):
        raise DatasetIntegrityError("Parameter 'soil_weights' must be a mapping.")
    for comp in ("soil_health", "erosion", "pest_break"):
        if comp not in soil_weights or not is_valid_number(soil_weights[comp]):
            raise DatasetIntegrityError(
                f"Parameter 'soil_weights.{comp}' must be a valid number."
            )

    for pb_key in ("pest_break_same_family", "pest_break_diff_family"):
        if not is_valid_number(parameters.get(pb_key)):
            raise DatasetIntegrityError(f"Parameter '{pb_key}' must be a valid number.")

    conf = parameters.get("confidence")
    if not isinstance(conf, dict):
        raise DatasetIntegrityError("Parameter 'confidence' must be a mapping.")
    for c_key in ("high_coverage", "medium_coverage", "high_min_years"):
        if not is_valid_number(conf.get(c_key)):
            raise DatasetIntegrityError(f"Parameter 'confidence.{c_key}' must be a valid number.")
