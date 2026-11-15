
import csv
from pathlib import Path
from datetime import datetime, timedelta
from collections import Counter

# ==========================================
# FIELD TRIAGE - INTEGRATED DATA VALIDATION
# POWER + SMAP + MODIS
# ==========================================

ROOT = Path(__file__).resolve().parent.parent

RAW = ROOT / "data" / "raw" / "F01"
PROCESSED = ROOT / "data" / "processed" / "F01"

MASTER_FILE = PROCESSED / "F01_nasa_integrated_daily.csv"

POWER_FILE = RAW / "power_daily.csv"
SMAP_FILE = RAW / "F01_smap_daily.csv"


def read_csv(path):
    with open(path, "r", newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def parse_date(value):
    return datetime.strptime(value, "%Y-%m-%d").date()


def number(value):
    if value is None or value.strip() == "":
        return None
    return float(value)


# ==========================================
# 1. LOAD FILES
# ==========================================

print("\n========== LOADING DATA ==========")

master = read_csv(MASTER_FILE)
power = read_csv(POWER_FILE)
smap = read_csv(SMAP_FILE)

print("Integrated records:", len(master))
print("Original POWER records:", len(power))
print("Original SMAP records:", len(smap))


# ==========================================
# 2. REQUIRED COLUMNS
# ==========================================

expected_columns = [
    "date",
    "PRECTOTCORR",
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "RH2M",
    "ALLSKY_SFC_SW_DWN",
    "sm_surface",
    "sm_rootzone",
    "n_images",
    "NDVI",
    "EVI",
    "SummaryQA",
    "MODIS_composite_date"
]

actual_columns = list(master[0].keys()) if master else []

print("\n========== STRUCTURE CHECK ==========")

print("Actual columns:", actual_columns)

print("Expected columns:", expected_columns)

print("Missing columns:",
      [c for c in expected_columns if c not in actual_columns])

# ==========================================
# 3. DATE VALIDATION
# ==========================================

dates = [parse_date(row["date"]) for row in master]

unique_dates = set(dates)

print("\n========== DATE VALIDATION ==========")

print("First date:", min(dates))
print("Last date:", max(dates))

print("Total unique dates:", len(unique_dates))

print("Duplicate dates:", len(dates) - len(unique_dates))

expected_dates = []

current = min(dates)
last = max(dates)

while current <= last:
    expected_dates.append(current)
    current += timedelta(days=1)

missing_dates = set(expected_dates) - unique_dates

print("Missing calendar dates:", len(missing_dates))


# ==========================================
# 4. VERIFY POWER AND SMAP PRESERVATION
# ==========================================

power_map = {
    row["date"]: row for row in power
}

smap_map = {
    row["date"]: row for row in smap
}

power_columns = [
    "PRECTOTCORR",
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "RH2M",
    "ALLSKY_SFC_SW_DWN"
]

smap_columns = [
    "sm_surface",
    "sm_rootzone",
    "n_images"
]

power_mismatches = 0
smap_mismatches = 0

for row in master:

    date = parse_date(row["date"]).strftime("%Y%m%d")
    iso_date = parse_date(row["date"]).isoformat()

    original_power = power_map.get(date)
    original_smap = smap_map.get(iso_date)

    if original_power is None:
        power_mismatches += 1
        continue

    if original_smap is None:
        smap_mismatches += 1
        continue

    for col in power_columns:
        if row[col] != original_power[col]:
            power_mismatches += 1

    for col in smap_columns:
        if row[col] != original_smap[col]:
            smap_mismatches += 1

print("\n========== SOURCE PRESERVATION ==========")

print("POWER mismatches:", power_mismatches)
print("SMAP mismatches:", smap_mismatches)


# ==========================================
# 5. MODIS QUALITY VALIDATION
# ==========================================

qa_counts = Counter()

good_ndvi_missing = 0
good_evi_missing = 0
bad_quality_with_values = 0
uncovered_with_values = 0

ndvi_values = []
evi_values = []

composite_dates = set()

for row in master:

    qa = row["SummaryQA"].strip()

    ndvi = number(row["NDVI"])
    evi = number(row["EVI"])

    composite_date = row["MODIS_composite_date"].strip()

    qa_counts[qa if qa else "No coverage"] += 1

    if composite_date:
        composite_dates.add(composite_date)

    if qa == "0":

        if ndvi is None:
            good_ndvi_missing += 1

        if evi is None:
            good_evi_missing += 1

    elif qa in ("1", "2", "3"):

        if ndvi is not None or evi is not None:
            bad_quality_with_values += 1

    elif qa == "":

        if ndvi is not None or evi is not None:
            uncovered_with_values += 1

    else:
        print("Unexpected QA value:", qa)

    if ndvi is not None:
        ndvi_values.append(ndvi)

    if evi is not None:
        evi_values.append(evi)


print("\n========== MODIS QUALITY VALIDATION ==========")

print("Daily QA distribution:")

for qa, count in sorted(qa_counts.items()):
    print(qa, ":", count)

print("Distinct composite dates assigned:", len(composite_dates))

print("Good QA missing NDVI:", good_ndvi_missing)
print("Good QA missing EVI:", good_evi_missing)

print("Bad QA rows with vegetation values:",
      bad_quality_with_values)

print("Uncovered rows with vegetation values:",
      uncovered_with_values)


# ==========================================
# 6. VALUE RANGE VALIDATION
# ==========================================

surface = [number(r["sm_surface"]) for r in master]
rootzone = [number(r["sm_rootzone"]) for r in master]

surface = [v for v in surface if v is not None]
rootzone = [v for v in rootzone if v is not None]

print("\n========== VALUE RANGE VALIDATION ==========")

print("Surface moisture:",
      min(surface), "to", max(surface))

print("Root-zone moisture:",
      min(rootzone), "to", max(rootzone))

print("NDVI:",
      min(ndvi_values), "to", max(ndvi_values))

print("EVI:",
      min(evi_values), "to", max(evi_values))

print("Invalid surface moisture:",
      sum(v < 0 or v > 1 for v in surface))

print("Invalid root-zone moisture:",
      sum(v < 0 or v > 1 for v in rootzone))

print("Invalid NDVI:",
      sum(v < -0.2 or v > 1 for v in ndvi_values))

print("Invalid EVI:",
      sum(v < -0.2 or v > 1 for v in evi_values))


# ==========================================
# 7. FINAL SUMMARY
# ==========================================

checks = {
    "Required columns": all(
        col in actual_columns for col in expected_columns
    ),
    "No duplicate dates": len(dates) == len(unique_dates),
    "No missing calendar dates": len(missing_dates) == 0,
    "POWER preserved": power_mismatches == 0,
    "SMAP preserved": smap_mismatches == 0,
    "Good QA NDVI complete": good_ndvi_missing == 0,
    "Good QA EVI complete": good_evi_missing == 0,
    "Bad QA vegetation masked": bad_quality_with_values == 0,
    "Uncovered vegetation empty": uncovered_with_values == 0,
    "Soil moisture valid": all(0 <= v <= 1 for v in surface + rootzone),
    "NDVI valid": all(-0.2 <= v <= 1 for v in ndvi_values),
    "EVI valid": all(-0.2 <= v <= 1 for v in evi_values)
}

print("\n========== FINAL VALIDATION REPORT ==========")

for name, passed in checks.items():
    print(("PASS" if passed else "FAIL"), "-", name)

print("\nPassed:", sum(checks.values()), "/", len(checks))

if all(checks.values()):
    print("\nINTEGRATED DATASET VALIDATION SUCCESSFUL!")

else:
    print("\nVALIDATION NEEDS ATTENTION!")

print("\n========== VALIDATION FINISHED ==========")
