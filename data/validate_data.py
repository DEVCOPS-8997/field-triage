import json
from pathlib import Path

d = Path(__file__).parent
load = lambda n: json.load(open(d / n, encoding="utf-8"))
fields, crops, rots, params, meta = (load(n) for n in ["fields.json", "crops.json", "rotations.json", "parameters.json", "nasa_metadata.json"])
cmap = {c["crop_id"]: c for c in crops}
rmap = {r["rotation_id"]: r for r in rots}
errors = []

for c in crops:
    if not c["references"]:
        errors.append(f"{c['crop_id']} has no references")
    if c["heat_threshold_c"] not in params["heat_buckets_c"]:
        errors.append(f"{c['crop_id']} heat threshold not in buckets")
    for k in ["drought_tolerance", "waterlogging_tolerance"]:
        if not 1 <= c[k] <= 5:
            errors.append(f"{c['crop_id']} {k} out of range")
    n = c.get("n_fix_kg_ha", 0)
    if not 0 <= n <= 300:
        errors.append(f"{c['crop_id']} n_fix_kg_ha out of range")
    if n > 0 and not c.get("n_fix_sources"):
        errors.append(f"{c['crop_id']} n_fix_kg_ha has no source")

for r in rots:
    for cid in r["sequence"] + ([r["cover_crop"]] if r["cover_crop"] else []):
        if cid not in cmap:
            errors.append(f"{r['rotation_id']} unknown crop {cid}")
        elif r["region_id"] not in cmap[cid]["calendars"]:
            errors.append(f"{r['rotation_id']} crop {cid} has no calendar for {r['region_id']}")

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

print(f"fields={len(fields)} crops={len(crops)} rotations={len(rots)} sources={len(meta)}")
print("ALL CHECKS PASSED" if not errors else "\n".join(errors))