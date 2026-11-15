import json
from pathlib import Path

d = Path(__file__).parent
load = lambda n: json.load(open(d / n, encoding="utf-8"))
fields, crops, rots, params, meta, regions = (load(n) for n in ["fields.json", "crops.json", "rotations.json", "parameters.json", "nasa_metadata.json", "regions.json"])
region_ids = {r["region_id"] for r in regions}
fallback = {r["region_id"]: r.get("calendar_fallback", []) for r in regions}
borrowed_notes = []
cmap = {c["crop_id"]: c for c in crops}
rmap = {r["rotation_id"]: r for r in rots}
errors = []

for c in crops:
    if not c["references"]:
        errors.append(f"{c['crop_id']} has no references")
    if not min(params["heat_buckets_c"]) <= c["heat_threshold_c"] <= max(params["heat_buckets_c"]):
        errors.append(f"{c['crop_id']} heat threshold outside the counted range")
    for k in ("kc", "calendars"):
        if not c.get(k):
            errors.append(f"{c['crop_id']} has no {k}")
    for k in ["drought_tolerance", "waterlogging_tolerance"]:
        if not 1 <= c[k] <= 5:
            errors.append(f"{c['crop_id']} {k} out of range")
    n = c.get("n_fix_kg_ha", 0)
    if not 0 <= n <= 300:
        errors.append(f"{c['crop_id']} n_fix_kg_ha out of range")
    if n > 0 and not c.get("n_fix_sources"):
        # Not fatal: the app shows uncited nitrogen as an estimate and lists it as a data gap.
        borrowed_notes.append(f"{c['crop_id']}: nitrogen {n} kg/ha has no citation (shown as an estimate)")

for r in rots:
    for cid in r["sequence"] + ([r["cover_crop"]] if r["cover_crop"] else []):
        if cid not in cmap:
            errors.append(f"{r['rotation_id']} unknown crop {cid}")
        elif r["region_id"] not in region_ids:
            errors.append(f"{r['rotation_id']} region {r['region_id']} is not in regions.json")
        elif r["region_id"] not in cmap[cid]["calendars"]:
            src = next((s for s in fallback.get(r["region_id"], []) if s in cmap[cid]["calendars"]), None)
            if src:
                borrowed_notes.append(f"{r['rotation_id']}: {cid} uses the {src} calendar for {r['region_id']}")
            else:
                errors.append(f"{r['rotation_id']} crop {cid} has no calendar for {r['region_id']} (and no fallback)")

for f in fields:
    rid = f["current_rotation_id"]
    if rid not in rmap:
        errors.append(f"{f['field_id']} unknown rotation {rid}")
    elif rmap[rid]["region_id"] != f["region_id"]:
        errors.append(f"{f['field_id']} rotation region mismatch")
    if not -90 <= f["location"]["lat"] <= 90 or not -180 <= f["location"]["lon"] <= 180:
        errors.append(f"{f['field_id']} bad coordinates")
    ring = f["geometry"]["coordinates"][0]
    if ring[0] != ring[-1]:
        errors.append(f"{f['field_id']} polygon not closed")

for region in {f["region_id"] for f in fields}:
    if sum(1 for r in rots if r["region_id"] == region) < 3:
        errors.append(f"{region} has fewer than 3 rotations")

print(f"fields={len(fields)} crops={len(crops)} rotations={len(rots)} sources={len(meta)} regions={len(regions)}")
if borrowed_notes:
    print(f"{len(borrowed_notes)} notes (flagged to farmers, not errors):")
    print("  " + "\n  ".join(borrowed_notes))
print("ALL CHECKS PASSED" if not errors else "\n".join(errors))