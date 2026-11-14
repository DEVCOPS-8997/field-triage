
import argparse
import csv
from datetime import date
from pathlib import Path

from common import (
    POWER_API_URL,
    POWER_PARAMETERS,
    get_field_raw_dir,
    get_power_end_date,
    request_json,
    save_json,
)


START_DATE = "20050101"


def extract_power(field_id: str, latitude: float, longitude: float):
    """Download daily NASA POWER climate data for one field."""

    end_date = get_power_end_date().strftime("%Y%m%d")

    params = {
        "parameters": ",".join(POWER_PARAMETERS),
        "community": "AG",
        "longitude": longitude,
        "latitude": latitude,
        "start": START_DATE,
        "end": end_date,
        "format": "JSON",
    }

    print(f"Requesting NASA POWER data for {field_id}...")
    print(f"Coordinates: {latitude}, {longitude}")
    print(f"Date range: {START_DATE} to {end_date}")

    response_data = request_json(POWER_API_URL, params)

    try:
        parameter_data = response_data["properties"]["parameter"]
    except KeyError as error:
        raise ValueError(
            "Unexpected NASA POWER response. "
            "The expected climate data was not found."
        ) from error

    # Collect every date returned by NASA POWER.
    all_dates = set()

    for variable in POWER_PARAMETERS:
        if variable in parameter_data:
            all_dates.update(parameter_data[variable].keys())

    if not all_dates:
        raise ValueError("NASA POWER returned no daily observations.")

    output_dir = get_field_raw_dir(field_id)
    csv_path = output_dir / "power_daily.csv"

    # Write the observations without converting missing values to zero.
    with csv_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=["date"] + POWER_PARAMETERS
        )
        writer.writeheader()

        for observation_date in sorted(all_dates):
            row = {"date": observation_date}

            for variable in POWER_PARAMETERS:
                value = parameter_data.get(variable, {}).get(
                    observation_date
                )

                if value is None or value == -999:
                    row[variable] = ""
                else:
                    row[variable] = value

            writer.writerow(row)

    metadata = {
        "field_id": field_id,
        "source": "NASA POWER",
        "api_url": POWER_API_URL,
        "latitude": latitude,
        "longitude": longitude,
        "start_date": START_DATE,
        "end_date": end_date,
        "parameters": POWER_PARAMETERS,
        "record_count": len(all_dates),
        "retrieved_on": date.today().isoformat(),
        "data_quality": "observed",
        "output_file": str(csv_path.relative_to(output_dir.parent.parent)),
    }

    save_json(metadata, output_dir / "power_metadata.json")

    print("\nExtraction completed!")
    print(f"Daily records: {len(all_dates)}")
    print(f"CSV saved to: {csv_path}")
    print(f"Metadata saved to: {output_dir / 'power_metadata.json'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Extract daily climate data from NASA POWER."
    )

    parser.add_argument("--field-id", required=True)
    parser.add_argument("--latitude", type=float, required=True)
    parser.add_argument("--longitude", type=float, required=True)

    args = parser.parse_args()

    extract_power(
        field_id=args.field_id,
        latitude=args.latitude,
        longitude=args.longitude,
    )
