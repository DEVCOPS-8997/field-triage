
import csv
from pathlib import Path
from datetime import datetime, timedelta

# Locate NASA POWER dataset
project_dir = Path(__file__).resolve().parent.parent
csv_path = project_dir / "data" / "raw" / "F01" / "power_daily.csv"

# Expected variables
variables = [
    "PRECTOTCORR",
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "RH2M",
    "ALLSKY_SFC_SW_DWN"
]

print("\n========== NASA POWER VALIDATION ==========")

records = []
missing_values = {v: 0 for v in variables}
invalid_values = {v: 0 for v in variables}
statistics = {
    v: {"min": None, "max": None, "sum": 0, "count": 0}
    for v in variables
}

with csv_path.open("r", newline="", encoding="utf-8") as file:
    reader = csv.DictReader(file)

    print("\n1. CSV columns:")
    print(reader.fieldnames)

    for row in reader:
        records.append(row)

print("\n2. Dataset information:")
print("Total records:", len(records))
print("Total columns:", len(records[0]) if records else 0)

# Check dates
dates = []

for row in records:
    try:
        dates.append(
            datetime.strptime(row["date"], "%Y%m%d").date()
        )
    except (ValueError, TypeError):
        print("Invalid date:", row["date"])

print("\n3. Date coverage:")
if dates:
    print("First date:", min(dates))
    print("Last date:", max(dates))

# Duplicate dates
print("\n4. Duplicate dates:")
print(len(dates) - len(set(dates)))

# Missing and invalid observations
for row in records:
    for variable in variables:
        value = row.get(variable, "").strip()

        if value == "" or value == "-999":
            missing_values[variable] += 1
            continue

        try:
            number = float(value)
        except ValueError:
            invalid_values[variable] += 1
            continue

        stat = statistics[variable]

        stat["min"] = (
            number if stat["min"] is None
            else min(stat["min"], number)
        )
        stat["max"] = (
            number if stat["max"] is None
            else max(stat["max"], number)
        )

        stat["sum"] += number
        stat["count"] += 1

print("\n5. Missing observations:")
for variable, count in missing_values.items():
    print(f"{variable}: {count}")

print("\n6. Invalid observations:")
for variable, count in invalid_values.items():
    print(f"{variable}: {count}")

# Statistics
print("\n7. Climate statistics:")

for variable, stat in statistics.items():
    if stat["count"]:
        average = stat["sum"] / stat["count"]

        print(f"\n{variable}")
        print("Minimum:", round(stat["min"], 2))
        print("Maximum:", round(stat["max"], 2))
        print("Average:", round(average, 2))
        print("Valid observations:", stat["count"])

# Check missing calendar dates
print("\n8. Missing calendar dates:")

expected_dates = set()
current = datetime(2005, 1, 1).date()
end = datetime(2026, 11, 9).date()

while current <= end:
    expected_dates.add(current)
    current += timedelta(days=1)

missing_dates = expected_dates - set(dates)

print("Expected dates:", len(expected_dates))
print("Actual unique dates:", len(set(dates)))
print("Missing dates:", len(missing_dates))

# Final result
print("\n========== VALIDATION SUMMARY ==========")

if (
    len(records) == 7983
    and len(set(dates)) == 7983
    and not missing_dates
    and all(count == 0 for count in invalid_values.values())
):
    print("PASS: Complete daily date coverage.")
else:
    print("CHECK: Dataset requires further investigation.")

print("\nValidation completed successfully.")
