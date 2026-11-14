
import csv
from pathlib import Path

# Project root
ROOT = Path(__file__).resolve().parent.parent

files = {
    "POWER": ROOT / "data/raw/F01/power_daily.csv",
    "SMAP": ROOT / "data/raw/F01/F01_smap_daily.csv",
    "MODIS": ROOT / "data/raw/F01/F01_MODIS_NDVI_EVI.csv"
}

for name, path in files.items():

    print("\n" + "=" * 55)
    print(f"{name} DATASET INSPECTION")
    print("=" * 55)

    if not path.exists():
        print("FILE NOT FOUND:", path)
        continue

    with open(path, "r", encoding="utf-8-sig",
              newline="") as f:

        reader = csv.DictReader(f)
        rows = list(reader)

    print("\nFile:", path.name)
    print("Total records:", len(rows))
    print("Columns:", reader.fieldnames)

    print("\nFirst 3 records:")

    for row in rows[:3]:
        print(row)

    print("\nLast record:")

    if rows:
        print(rows[-1])
