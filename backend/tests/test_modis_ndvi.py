"""MODIS NDVI: AppEEARS CSV parsing, QA filtering, aggregation and profile merge (all offline)."""

from __future__ import annotations

from datetime import date, timedelta

from app.models.schemas import FieldProfile
from app.services import modis_ndvi
from app.services.modis_ndvi import Composite, parse_appeears_csv, pixel_key, summarize
from tests.conftest import make_synthetic_profile_dict

CSV = """ID,Latitude,Longitude,Date,MODIS_Tile,MOD13Q1_061__250m_16_days_NDVI,MOD13Q1_061__250m_16_days_pixel_reliability
p1,31.42,73.08,2020-01-01,h24v05,0.5521,0
p1,31.42,73.08,2020-01-17,h24v05,0.6012,1
p1,31.42,73.08,2020-02-02,h24v05,0.4000,3
p1,31.42,73.08,2020-02-18,h24v05,-0.3000,0
p1,31.42,73.08,2020-03-05,h24v05,1500,0
"""


def test_appeears_csv_parsed_scaled_and_fill_dropped() -> None:
    comps = parse_appeears_csv(CSV)
    assert len(comps) == 5
    assert comps[0].ndvi == 0.5521 and comps[0].reliability == 0
    assert comps[2].reliability == 3  # cloud kept as a row, filtered later
    assert comps[3].ndvi is None  # -0.3 is the scaled fill value, never zero
    assert comps[4].ndvi == 0.15  # raw DN 1500 -> 0.15


def test_summary_keeps_only_good_pixels_and_counts_bare_days() -> None:
    comps: list[Composite] = []
    d = date(2019, 1, 1)
    for i in range(23 * 2):  # two full years of 16-day composites
        day = d + timedelta(days=16 * i)
        green = day.month not in (5, 6)  # May-June bare
        comps.append(Composite(day, 0.55 if green else 0.12, 0))
    comps.append(Composite(date(2019, 7, 1), 0.95, 3))  # cloudy: must be ignored
    s = summarize(comps, bare_threshold=0.2)
    assert s["n_composites_good"] == 46
    assert s["ndvi_monthly_mean"][4] == 0.12 and s["ndvi_monthly_mean"][6] == 0.55
    assert 40 <= s["bare_days_est_mean"] <= 80  # ~2 of 12 months below 0.2
    assert s["ndvi_peak_mean"] == 0.55


def test_apply_to_profile_marks_modis_observed() -> None:
    profile = FieldProfile.model_validate(
        make_synthetic_profile_dict(field_id="F01", region_id="pk_punjab", data_mode="observed", n_years=2)
    )
    y = profile.monthly[0].year
    ndvi = {
        "provider": "nasa_appeears", "lat": 31.42, "lon": 73.08, "period_start": f"{y}-01-01", "period_end": f"{y}-12-31",
        "n_composites_good": 20, "monthly": [{"year": y, "month": 1, "ndvi_mean": 0.61, "n": 2}],
        "ndvi_monthly_mean": [0.61] + [None] * 11, "ndvi_peak_mean": 0.61, "ndvi_peak_month": 1,
        "bare_days_est_mean": 75.0, "ndvi_latest": 0.4, "ndvi_latest_date": f"{y}-12-18",
    }
    modis_ndvi.apply_to_profile(profile, ndvi)
    assert profile.monthly[0].ndvi_mean == 0.61
    assert profile.climatology["bare_days_est_mean"] == 75.0
    assert profile.data_quality["modis"] == "observed"
    assert "AppEEARS" in profile.data_sources["modis"]


def test_pixel_key_snaps_to_250m() -> None:
    assert pixel_key(31.42001, 73.08001) == pixel_key(31.4199, 73.0799)
    assert pixel_key(31.42, 73.08) != pixel_key(31.43, 73.08)


def test_status_without_providers_is_not_configured(tmp_path, monkeypatch) -> None:
    from app.config import get_settings

    settings = get_settings(data_mode="demo")
    object.__setattr__(settings, "ndvi_cache_dir", tmp_path)
    st = modis_ndvi.status(settings, 10.0, 10.0, start=True)
    assert st["state"] in ("running", "not_configured")
    # The background job finishes quickly when no provider is available.
    import time
    for _ in range(50):
        st = modis_ndvi.status(settings, 10.0, 10.0, start=False)
        if st["state"] != "running":
            break
        time.sleep(0.05)
    assert st["state"] == "not_configured" and "EARTHDATA_USERNAME" in st["message"]
