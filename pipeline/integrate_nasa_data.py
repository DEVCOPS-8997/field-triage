
import csv
from pathlib import Path
from datetime import datetime, timedelta

# ==========================================
# FIELD SHIFT - NASA DATA INTEGRATION
# Field: F01
# Sources: POWER + SMAP + MODIS
# ==========================================

ROOT = Path(__file__).resolve().parent.parent

RAW = ROOT / "data" / "raw" / "F01"
OUTPUT = ROOT / "data" / "processed" / "F01"

OUTPUT.mkdir(parents=True, exist_ok=True)

POWER_FILE = RAW / "power_daily.csv"
SMAP_FILE = RAW / "F01_smap_daily.csv"
MODIS_FILE = RAW / "F01_MODIS_NDVI_EVI.csv"

OUTPUT_FILE = OUTPUT / "F01_nasa_integrated_daily.csv"


# ==========================================
# 1. DATE CONVERSION
# ==========================================

def parse_date(value):

    value = value.strip()

    for fmt in ("%Y-%m-%d", "%Y%m%d", "%m/%d/%Y"):

        try:
            return datetime.strptime(value, fmt).date()

        except ValueError:
            continue

    raise ValueError(f"Invalid date: {value}")


# ==========================================
# 2. CSV READER
# ==========================================

def read_csv_file(path):

    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")

    with open(
        path,
        "r",
        newline="",
        encoding="utf-8-sig"
    ) as file:

        return list(csv.DictReader(file))


# ==========================================
# 3. LOAD NASA DATASETS
# ==========================================

print("\n========== LOADING NASA DATA ==========")

power_rows = read_csv_file(POWER_FILE)
smap_rows = read_csv_file(SMAP_FILE)
modis_rows = read_csv_file(MODIS_FILE)

print("POWER records:", len(power_rows))
print("SMAP records:", len(smap_rows))
print("MODIS records:", len(modis_rows))


# ==========================================
# 4. PREPARE POWER DATA
# ==========================================

power_data = {}

for row in power_rows:

    date = parse_date(row["date"])

    if date in power_data:
        raise ValueError(f"Duplicate POWER date: {date}")

    power_data[date] = row


# ==========================================
# 5. PREPARE SMAP DATA
# ==========================================

smap_data = {}

for row in smap_rows:

    date = parse_date(row["date"])

    if date in smap_data:
        raise ValueError(f"Duplicate SMAP date: {date}")

    smap_data[date] = row


# ==========================================
# 6. PREPARE MODIS COMPOSITES
# ==========================================

modis_data = {}

for row in modis_rows:

    date = parse_date(row["date"])

    if date in modis_data:
        raise ValueError(f"Duplicate MODIS date: {date}")

    modis_data[date] = {
        "NDVI": row["NDVI"].strip(),
        "EVI": row["EVI"].strip(),
        "SummaryQA": row["SummaryQA"].strip()
    }

modis_dates = sorted(modis_data.keys())


# ==========================================
# 7. CREATE DAILY MASTER DATE LIST
# ==========================================

master_dates = sorted(
    date for date in smap_data
    if date in power_data
)

if not master_dates:
    raise ValueError("No overlapping POWER and SMAP dates.")

print("\n========== DATE ALIGNMENT ==========")

print("First master date:", master_dates[0])
print("Last master date:", master_dates[-1])

print("Integrated daily records:", len(master_dates))


# ==========================================
# 8. MERGE POWER + SMAP + MODIS
# ==========================================

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

output_columns = (
    ["date"]
    + power_columns
    + smap_columns
    + [
        "NDVI",
        "EVI",
        "SummaryQA",
        "MODIS_composite_date"
    ]
)

integrated_rows = []

modis_index = 0

for date in master_dates:

    # Daily POWER values
    power = power_data[date]

    # Daily SMAP values
    smap = smap_data[date]

    # Move to the latest MODIS composite
    # whose start date is not after this date.
    while (
        modis_index + 1 < len(modis_dates)
        and modis_dates[modis_index + 1] <= date
    ):
        modis_index += 1

    vegetation = {
        "NDVI": "",
        "EVI": "",
        "SummaryQA": "",
        "MODIS_composite_date": ""
    }

    if modis_dates and modis_dates[0] <= date:

        composite_date = modis_dates[modis_index]

        next_date = (
            modis_dates[modis_index + 1]
            if modis_index + 1 < len(modis_dates)
            else None
        )

        # Each composite can cover up to 16 days.
        period_end = composite_date + timedelta(days=16)

        if next_date is not None:
            period_end = min(period_end, next_date)

        if composite_date <= date < period_end:

            modis = modis_data[composite_date]

            qa = int(float(modis["SummaryQA"]))

            vegetation["SummaryQA"] = str(qa)
            vegetation["MODIS_composite_date"] = (
                composite_date.isoformat()
            )

            # Only use good-quality observations.
            if qa == 0:

                vegetation["NDVI"] = modis["NDVI"]
                vegetation["EVI"] = modis["EVI"]

    # Build integrated daily record
    record = {
        "date": date.isoformat()
    }

    for column in power_columns:
        record[column] = power[column]

    for column in smap_columns:
        record[column] = smap[column]

    record.update(vegetation)

    integrated_rows.append(record)


# ==========================================
# 9. EXPORT INTEGRATED DATASET
# ==========================================

with open(
    OUTPUT_FILE,
    "w",
    newline="",
    encoding="utf-8"
) as file:

    writer = csv.DictWriter(
        file,
        fieldnames=output_columns
    )

    writer.writeheader()
    writer.writerows(integrated_rows)


# ==========================================
# 10. BASIC INTEGRATION SUMMARY
# ==========================================

valid_ndvi = sum(
    bool(row["NDVI"]) for row in integrated_rows
)

valid_evi = sum(
    bool(row["EVI"]) for row in integrated_rows
)

valid_qa = sum(
    row["SummaryQA"] == "0"
    for row in integrated_rows
)

print("\n========== INTEGRATION SUMMARY ==========")

print("Total integrated records:", len(integrated_rows))

print("POWER records included:", len(integrated_rows))
print("SMAP records included:", len(integrated_rows))

print("MODIS NDVI available:", valid_ndvi)
print("MODIS EVI available:", valid_evi)
print("Good-quality MODIS daily assignments:", valid_qa)

print(
    "Missing NDVI:",
    len(integrated_rows) - valid_ndvi
)

print(
    "Missing EVI:",
    len(integrated_rows) - valid_evi
)

print("\nOutput file:")
print(OUTPUT_FILE)

print("\n========== INTEGRATION COMPLETED ==========")
