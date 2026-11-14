
import csv
from datetime import datetime, timedelta
from collections import Counter

FILE = "../data/raw/F01/F01_smap_daily.csv"

total = 0
dates = []
date_counts = Counter()
missing = Counter()
image_counts = Counter()

surface = []
rootzone = []
invalid = 0

with open(FILE, "r", newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)

    required = {
        "date", "sm_surface", "sm_rootzone", "n_images"
    }

    if not required.issubset(reader.fieldnames or []):
        raise ValueError(
            f"Missing columns. Found: {reader.fieldnames}"
        )

    for row in reader:
        total += 1

        try:
            date = datetime.strptime(
                row["date"].strip(), "%Y-%m-%d"
            ).date()

            s = float(row["sm_surface"])
            r = float(row["sm_rootzone"])
            n = int(row["n_images"])

            dates.append(date)
            surface.append(s)
            rootzone.append(r)

            date_counts[date] += 1
            image_counts[n] += 1

            if not (0 <= s <= 1 and 0 <= r <= 1):
                invalid += 1

            if not row["sm_surface"] or not row["sm_rootzone"]:
                missing["soil_moisture"] += 1

        except (ValueError, TypeError) as e:
            print("Invalid row:", row, e)
            missing["invalid_rows"] += 1

print("\n========== SMAP VALIDATION ==========")

print("Total rows:", total)

if dates:
    first = min(dates)
    last = max(dates)

    print("First date:", first)
    print("Last date:", last)

    expected = (last - first).days + 1
    unique_dates = len(set(dates))

    print("Unique dates:", unique_dates)
    print("Expected calendar days:", expected)
    print("Missing calendar days:", expected - unique_dates)

print("\nDuplicate dates:", sum(
    count - 1 for count in date_counts.values()
    if count > 1
))

print("\nImage count distribution:")
for count, frequency in sorted(image_counts.items()):
    print(f"{count} images: {frequency} rows")

print("\nInvalid moisture values:", invalid)

print("\nSurface moisture range:")
if surface:
    print(min(surface), "to", max(surface))

print("\nRootzone moisture range:")
if rootzone:
    print(min(rootzone), "to", max(rootzone))

print("\nMissing values:", dict(missing))

print("\n========== VALIDATION COMPLETE ==========")
