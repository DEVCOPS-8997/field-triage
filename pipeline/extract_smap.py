
import ee
import json
from pathlib import Path
from datetime import date, datetime, timedelta, timezone

# ==========================================
# FIELD SHIFT - NASA SMAP EXTRACTION
# ==========================================

PROJECT_ID = "field-shift-nasa"

FIELD_ID = "F01"
LATITUDE = 33.790823
LONGITUDE = 72.662462

START_DATE = "2015-03-31"

DATASET_ID = "NASA/SMAP/SPL4SMGP/008"

BANDS = [
    "sm_surface",
    "sm_rootzone"
]

# ==========================================
# INITIALIZE EARTH ENGINE
# ==========================================

print("Connecting to Google Earth Engine...")

ee.Initialize(project=PROJECT_ID)

print("Earth Engine connected!")

# ==========================================
# LOAD NASA SMAP DATASET
# ==========================================

print("\nLoading NASA SMAP dataset...")

collection = (
    ee.ImageCollection(DATASET_ID)
    .filterDate(START_DATE, "2027-01-01")
    .select(BANDS)
)

# Find the latest available observation.
latest_timestamp = collection.aggregate_max(
    "system:time_start"
).getInfo()

if latest_timestamp is None:
    raise RuntimeError("NASA SMAP returned no observations.")

latest_datetime = datetime.fromtimestamp(
    latest_timestamp / 1000,
    tz=timezone.utc
)

latest_date = latest_datetime.date()

print("Latest SMAP observation:", latest_datetime)

# Include the latest observation's calendar day.
start_date = date.fromisoformat(START_DATE)
end_date = latest_date + timedelta(days=1)

number_of_days = (end_date - start_date).days

print("Start date:", start_date)
print("Last date:", latest_date)
print("Days to process:", number_of_days)

# ==========================================
# DEFINE F01 LOCATION
# ==========================================

point = ee.Geometry.Point([
    LONGITUDE,
    LATITUDE
])

# ==========================================
# CALCULATE DAILY AVERAGES
# ==========================================

print("\nPreparing daily soil-moisture extraction...")

day_offsets = ee.List.sequence(
    0,
    number_of_days - 1
)

def extract_daily_mean(offset):

    offset = ee.Number(offset)

    day = ee.Date(START_DATE).advance(
        offset,
        "day"
    )

    next_day = day.advance(1, "day")

    daily_images = collection.filterDate(
        day,
        next_day
    )

    image_count = daily_images.size()

    daily_mean = daily_images.mean()

    values = daily_mean.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=point,
        scale=11000,
        maxPixels=1000000000
    )

    return ee.Feature(
        None,
        values
    ).set({
        "date": day.format("YYYY-MM-dd"),
        "n_images": image_count
    })


daily_features = ee.FeatureCollection(
    day_offsets.map(extract_daily_mean)
)

# ==========================================
# EXPORT TO GOOGLE DRIVE
# ==========================================

print("\nPreparing Google Drive export...")

task = ee.batch.Export.table.toDrive(
    collection=daily_features,
    description="F01_SMAP_Daily",
    folder="FIELD_SHIFT_EXPORTS",
    fileNamePrefix="F01_smap_daily",
    fileFormat="CSV",
    selectors=[
        "date",
        "sm_surface",
        "sm_rootzone",
        "n_images"
    ]
)

task.start()

# ==========================================
# SAVE EXTRACTION METADATA
# ==========================================

project_dir = Path(__file__).resolve().parent.parent

output_dir = (
    project_dir /
    "data" /
    "raw" /
    FIELD_ID
)

output_dir.mkdir(
    parents=True,
    exist_ok=True
)

metadata = {
    "field_id": FIELD_ID,
    "source": "NASA SMAP L4 Version 8",
    "dataset_id": DATASET_ID,
    "latitude": LATITUDE,
    "longitude": LONGITUDE,
    "start_date": START_DATE,
    "end_date": latest_date.isoformat(),
    "latest_image_timestamp_utc": latest_datetime.isoformat(),
    "bands": BANDS,
    "spatial_resolution_m": 11000,
    "temporal_resolution": "3-hourly",
    "daily_aggregation": "Mean of available 3-hourly observations",
    "export_destination": "Google Drive/FIELD_SHIFT_EXPORTS",
    "export_file": "F01_smap_daily.csv",
    "task_id": task.id,
    "retrieved_on": date.today().isoformat()
}

metadata_path = output_dir / "smap_metadata.json"

with metadata_path.open(
    "w",
    encoding="utf-8"
) as file:
    json.dump(
        metadata,
        file,
        indent=4
    )

print("\n====================================")
print("SMAP EXPORT TASK SUBMITTED!")
print("====================================")

print("Field:", FIELD_ID)
print("Latest observation:", latest_date)
print("Task ID:", task.id)
print("Task status:", task.status()["state"])

print("\nMetadata saved to:", metadata_path)
print("\nCheck Google Earth Engine task status.")
