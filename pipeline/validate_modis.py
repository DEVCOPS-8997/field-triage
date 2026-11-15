
import csv
from pathlib import Path
from datetime import datetime
from collections import Counter

# ==========================================
# FIELD TRIAGE - MODIS DATA VALIDATION
# Standard Python CSV module (No Pandas)
# ==========================================

file_path = Path(__file__).resolve().parent.parent / "data" / "raw" / "F01" / "F01_MODIS_NDVI_EVI.csv"
if not file_path.exists():
    raise FileNotFoundError(f"File not found: {file_path.resolve()}")

# Read CSV
with open(file_path, "r", newline="", encoding="utf-8-sig") as file:
    reader = csv.DictReader(file)
    rows = list(reader)
    columns = reader.fieldnames

print("\n========== MODIS CSV INSPECTION ==========")

print("\nColumns:")
print(columns)

print("\nTotal records:", len(rows))

print("\nFirst 10 records:")

for row in rows[:10]:
    print(row)

# Required columns
required = ["date", "NDVI", "EVI", "SummaryQA"]

missing_columns = [
    col for col in required if col not in (columns or [])
]

if missing_columns:
    raise SystemExit(f"Missing required columns: {missing_columns}")

# Helper functions
def parse_date(value):
    if not value:
        return None

    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            pass

    return None


def parse_number(value):
    if value is None or value.strip() == "":
        return None

    try:
        return float(value)
    except ValueError:
        return None


# Prepare values
dates = []
ndvi_values = []
evi_values = []
qa_values = []

invalid_dates = 0

for row in rows:
    date = parse_date(row.get("date", ""))

    ndvi = parse_number(row.get("NDVI", ""))
    evi = parse_number(row.get("EVI", ""))
    qa = parse_number(row.get("SummaryQA", ""))

    if date is None:
        invalid_dates += 1
    else:
        dates.append(date)

    ndvi_values.append(ndvi)
    evi_values.append(evi)
    qa_values.append(qa)

# ==========================================
# VALIDATION
# ==========================================

print("\n========== MODIS VALIDATION ==========")

print("\nTotal records:", len(rows))

# Date checks
print("\nFirst date:", min(dates) if dates else None)
print("Last date:", max(dates) if dates else None)

print("Invalid dates:", invalid_dates)

date_counts = Counter(dates)

print(
    "Duplicate dates:",
    sum(count - 1 for count in date_counts.values())
)

# Quality distribution
print("\nSummaryQA distribution:")

qa_counts = Counter(
    str(int(value)) if value is not None and value.is_integer()
    else str(value)
    for value in qa_values
)

for quality, count in sorted(qa_counts.items()):
    print(quality, ":", count)

# Missing values
print("\nMissing values:")

print("NDVI:", sum(v is None for v in ndvi_values))
print("EVI:", sum(v is None for v in evi_values))
print("SummaryQA:", sum(v is None for v in qa_values))

# Good quality observations
good_indices = [
    i for i, qa in enumerate(qa_values)
    if qa == 0
]

print("\nGood-quality observations:", len(good_indices))

print(
    "Good-quality NDVI missing:",
    sum(ndvi_values[i] is None for i in good_indices)
)

print(
    "Good-quality EVI missing:",
    sum(evi_values[i] is None for i in good_indices)
)

# Vegetation ranges
valid_ndvi = [v for v in ndvi_values if v is not None]
valid_evi = [v for v in evi_values if v is not None]

print("\nNDVI range:")
if valid_ndvi:
    print(min(valid_ndvi), "to", max(valid_ndvi))

print("\nEVI range:")
if valid_evi:
    print(min(valid_evi), "to", max(valid_evi))

# Valid scaled range: -0.2 to 1.0
print("\nInvalid NDVI values:",
      sum(v < -0.2 or v > 1.0 for v in valid_ndvi))

print("Invalid EVI values:",
      sum(v < -0.2 or v > 1.0 for v in valid_evi))

# Quality masking
bad_indices = [
    i for i, qa in enumerate(qa_values)
    if qa is not None and qa != 0
]

print("\nNon-good-quality observations:", len(bad_indices))

print(
    "Non-good observations with NDVI:",
    sum(ndvi_values[i] is not None for i in bad_indices)
)

print(
    "Non-good observations with EVI:",
    sum(evi_values[i] is not None for i in bad_indices)
)

# Observation intervals
sorted_dates = sorted(set(dates))

intervals = Counter(
    (sorted_dates[i] - sorted_dates[i-1]).days
    for i in range(1, len(sorted_dates))
)

print("\nObservation interval distribution:")

for days, count in sorted(intervals.items()):
    print(days, "days:", count, "occurrences")

print("\n========== VALIDATION FINISHED ==========")
