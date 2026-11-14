"""Dataset and FieldProfile loader supporting DATA_MODE=demo and DATA_MODE=processed."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.config import Settings, get_settings
from app.models.schemas import FieldInfo, FieldProfile
from app.utils.validation import (
    DatasetIntegrityError,
    ProfileUnavailableError,
    UnknownFieldError,
    validate_field_exists,
    validate_parameters_dict,
)

# Explicit bidirectional mapping between canonical FieldProfile source keys (Section 5.8 / 7)
# and M3's dataset identifiers in data/nasa_metadata.json (never rename M3's IDs on disk).
PILLAR_TO_METADATA_ID: dict[str, str] = {
    "power": "power",
    "smap": "smap_l4",
    "modis": "modis_mod13q1",
    "soil": "soilgrids",
    "terrain": "srtm",
    "imerg": "imerg",
}

METADATA_ID_TO_PILLAR: dict[str, str] = {
    meta_id: pillar for pillar, meta_id in PILLAR_TO_METADATA_ID.items()
}

FIVE_CONFIDENCE_PILLARS: tuple[str, ...] = (
    "power",
    "smap",
    "modis",
    "soil",
    "terrain",
)


@dataclass(frozen=True)
class DomainCatalog:
    """Cached in-memory snapshot of M3's static agricultural and metadata JSON datasets."""

    fields: list[FieldInfo]
    fields_by_id: dict[str, FieldInfo]
    raw_fields_by_id: dict[str, dict[str, Any]]
    crops: list[dict[str, Any]]
    crops_by_id: dict[str, dict[str, Any]]
    rotations: list[dict[str, Any]]
    rotations_by_id: dict[str, dict[str, Any]]
    parameters: dict[str, Any]
    nasa_metadata: list[dict[str, Any]]
    nasa_metadata_by_id: dict[str, dict[str, Any]]


_CATALOG_CACHE: dict[Path, DomainCatalog] = {}
_PROFILE_CACHE: dict[tuple, FieldProfile] = {}


def clear_data_cache() -> None:
    """Clear cached static datasets (useful in tests switching DATA_DIR)."""
    _CATALOG_CACHE.clear()
    _PROFILE_CACHE.clear()


def _read_json_file(path: Path, *, is_profile: bool = False) -> Any:
    if not path.exists() or not path.is_file():
        if is_profile:
            raise ProfileUnavailableError(
                f"Required field profile file is unavailable at '{path}'."
            )
        raise DatasetIntegrityError(f"Required dataset file is missing at '{path}'.")

    try:
        raw_text = path.read_text(encoding="utf-8")
        # Parse with strict NaN rejection: JSON does not permit NaN/Infinity; missing data must be null
        return json.loads(
            raw_text,
            parse_constant=lambda c: (_ for _ in ()).throw(
                ValueError(f"Invalid non-standard JSON constant '{c}'")
            ),
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        if is_profile:
            raise ProfileUnavailableError(
                f"Failed to parse field profile JSON at '{path}': {exc}"
            ) from exc
        raise DatasetIntegrityError(
            f"Failed to parse dataset JSON at '{path}': {exc}"
        ) from exc


class DataLoader:
    """Loads M3 domain datasets and M1 demo/processed FieldProfile artifacts without live NASA calls."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings: Settings = settings or get_settings()

    def load_catalog(self) -> DomainCatalog:
        """Load and cache static domain JSON files from data_dir."""
        resolved_dir = self.settings.data_dir.resolve()
        cached = _CATALOG_CACHE.get(resolved_dir)
        if cached is not None:
            return cached

        raw_fields = _read_json_file(resolved_dir / "fields.json")
        raw_crops = _read_json_file(resolved_dir / "crops.json")
        raw_rotations = _read_json_file(resolved_dir / "rotations.json")
        raw_parameters = _read_json_file(resolved_dir / "parameters.json")
        raw_metadata = _read_json_file(resolved_dir / "nasa_metadata.json")

        if not isinstance(raw_fields, list):
            raise DatasetIntegrityError("fields.json must contain a JSON array.")
        if not isinstance(raw_crops, list):
            raise DatasetIntegrityError("crops.json must contain a JSON array.")
        if not isinstance(raw_rotations, list):
            raise DatasetIntegrityError("rotations.json must contain a JSON array.")
        if not isinstance(raw_metadata, list):
            raise DatasetIntegrityError("nasa_metadata.json must contain a JSON array.")

        validate_parameters_dict(raw_parameters)

        fields_list: list[FieldInfo] = []
        fields_by_id: dict[str, FieldInfo] = {}
        raw_fields_by_id: dict[str, dict[str, Any]] = {}

        try:
            for item in raw_fields:
                if not isinstance(item, dict):
                    raise DatasetIntegrityError("Each entry in fields.json must be an object.")
                fi = FieldInfo.model_validate(item)
                if fi.field_id in fields_by_id:
                    raise DatasetIntegrityError(f"Duplicate field_id '{fi.field_id}' in fields.json.")
                fields_list.append(fi)
                fields_by_id[fi.field_id] = fi
                # Preserve original metadata keys (e.g., source, boundary_source) without altering FieldInfo
                raw_fields_by_id[fi.field_id] = dict(item)
        except ValidationError as exc:
            raise DatasetIntegrityError(f"fields.json failed FieldInfo validation: {exc}") from exc

        crops_by_id: dict[str, dict[str, Any]] = {}
        for crop in raw_crops:
            if not isinstance(crop, dict) or "crop_id" not in crop:
                raise DatasetIntegrityError("Each entry in crops.json must have a 'crop_id'.")
            cid = str(crop["crop_id"])
            if cid in crops_by_id:
                raise DatasetIntegrityError(f"Duplicate crop_id '{cid}' in crops.json.")
            crops_by_id[cid] = crop

        rotations_by_id: dict[str, dict[str, Any]] = {}
        for rot in raw_rotations:
            if not isinstance(rot, dict) or "rotation_id" not in rot:
                raise DatasetIntegrityError("Each entry in rotations.json must have a 'rotation_id'.")
            rid = str(rot["rotation_id"])
            if rid in rotations_by_id:
                raise DatasetIntegrityError(f"Duplicate rotation_id '{rid}' in rotations.json.")
            rotations_by_id[rid] = rot

        metadata_by_id: dict[str, dict[str, Any]] = {}
        for entry in raw_metadata:
            if not isinstance(entry, dict) or "id" not in entry:
                raise DatasetIntegrityError("Each entry in nasa_metadata.json must have an 'id'.")
            metadata_by_id[str(entry["id"])] = entry

        catalog = DomainCatalog(
            fields=fields_list,
            fields_by_id=fields_by_id,
            raw_fields_by_id=raw_fields_by_id,
            crops=raw_crops,
            crops_by_id=crops_by_id,
            rotations=raw_rotations,
            rotations_by_id=rotations_by_id,
            parameters=raw_parameters,
            nasa_metadata=raw_metadata,
            nasa_metadata_by_id=metadata_by_id,
        )
        _CATALOG_CACHE[resolved_dir] = catalog
        return catalog

    def list_fields(self) -> list[FieldInfo]:
        return list(self.load_catalog().fields)

    def get_field(self, field_id: str) -> FieldInfo:
        catalog = self.load_catalog()
        return validate_field_exists(field_id, catalog.fields_by_id)

    def get_field_raw_metadata(self, field_id: str) -> dict[str, Any]:
        catalog = self.load_catalog()
        field = validate_field_exists(field_id, catalog.fields_by_id)
        return dict(catalog.raw_fields_by_id.get(field.field_id, {}))

    def list_crops(self) -> list[dict[str, Any]]:
        return list(self.load_catalog().crops)

    def list_rotations(self, region_id: str | None = None) -> list[dict[str, Any]]:
        rotations = self.load_catalog().rotations
        if region_id is None:
            return list(rotations)
        cleaned = region_id.strip()
        return [r for r in rotations if r.get("region_id") == cleaned]

    def list_nasa_metadata(self) -> list[dict[str, Any]]:
        return list(self.load_catalog().nasa_metadata)

    def get_metadata_for_pillar(self, pillar: str) -> dict[str, Any] | None:
        """Look up M3's nasa_metadata.json entry for a canonical FieldProfile pillar key."""
        catalog = self.load_catalog()
        canonical = METADATA_ID_TO_PILLAR.get(pillar, pillar)
        meta_id = PILLAR_TO_METADATA_ID.get(canonical, canonical)
        return catalog.nasa_metadata_by_id.get(meta_id)

    def load_field_profile(self, field_id: str) -> FieldProfile:
        """Validate field_id (404 if unknown), then load and validate its FieldProfile (503 if unavailable)."""
        field = self.get_field(field_id)
        profile_path = self.settings.resolve_profile_path(field.field_id)
        if self.settings.data_mode == "processed" and not profile_path.exists():
            # No pre-built profile.json: derive an observed profile from M1's integrated CSV.
            from app.services.m1_profile import build_profile, csv_path

            src = csv_path(self.settings.processed_dir, field.field_id)
            key = (src, src.stat().st_mtime_ns if src.exists() else 0)
            cached = _PROFILE_CACHE.get(key)
            if cached is None:
                cached = build_profile(field.field_id, self.settings.processed_dir)
                _PROFILE_CACHE[key] = cached
            profile_path = src
            raw_profile = cached.model_dump()
        else:
            raw_profile = _read_json_file(profile_path, is_profile=True)

        try:
            profile = FieldProfile.model_validate(raw_profile)
        except ValidationError as exc:
            raise ProfileUnavailableError(
                f"Profile for field '{field.field_id}' at '{profile_path}' failed FieldProfile validation: {exc}"
            ) from exc

        if profile.field_id != field.field_id:
            raise ProfileUnavailableError(
                f"Profile field_id mismatch at '{profile_path}': expected '{field.field_id}', "
                f"found '{profile.field_id}'."
            )

        expected_public_mode = self.settings.public_data_mode
        if profile.data_mode != expected_public_mode:
            raise ProfileUnavailableError(
                f"Profile '{profile_path}' declares data_mode='{profile.data_mode}', "
                f"which conflicts with operational DATA_MODE='{self.settings.data_mode}' "
                f"(expected data_mode='{expected_public_mode}')."
            )

        return profile
