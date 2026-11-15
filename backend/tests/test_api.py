"""Live-only API surface: health, catalog, regions, CORS, OpenAPI, and POWER window parsing.

Pilot-field scoring (F01 CSV / demo profiles) was removed from the API; scoring runs only on live
NASA POWER + SoilGrids + Copernicus DEM data via POST /locations/compare (see test_location.py).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.services.power_live import classify_now_conditions, parse_power_daily_payload, summarize_power_window


def test_health_docs_openapi_and_cors(demo_settings: Settings) -> None:
    client = TestClient(create_app(settings=demo_settings))
    h = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    assert h.status_code == 200
    assert h.json() == {"status": "ok", "service": "field-shift-advisor", "data_mode": "observed"}
    assert h.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert client.get("/docs").status_code == 200

    paths = client.get("/openapi.json").json()["paths"]
    for required in (
        "/api/v1/health", "/api/v1/rotations", "/api/v1/crops", "/api/v1/meta/sources",
        "/api/v1/regions", "/api/v1/locations/compare", "/api/v1/locations/data",
    ):
        assert required in paths, f"Missing route {required}"


def test_pilot_field_scoring_routes_are_removed(demo_settings: Settings) -> None:
    client = TestClient(create_app(settings=demo_settings))
    paths = client.get("/openapi.json").json()["paths"]
    for removed in ("/api/v1/fields", "/api/v1/fields/{field_id}/profile", "/api/v1/fields/{field_id}/now",
                    "/api/v1/rotations/compare"):
        assert removed not in paths
    assert client.get("/api/v1/fields").status_code == 404
    assert client.post("/api/v1/rotations/compare", json={"field_id": "F01"}).status_code in (404, 405)


def test_catalog_and_regions(demo_settings: Settings) -> None:
    client = TestClient(create_app(settings=demo_settings))
    crops = client.get("/api/v1/crops").json()
    assert {c["crop_id"] for c in crops} >= {"wheat", "rice", "maize", "soybean"}
    assert all(len(c["kc"]) == 3 for c in crops)
    for c in crops:
        for cal in c["calendars"].values():
            assert abs(sum(cal["stage_fractions"]) - 1.0) < 0.01
    rots = client.get("/api/v1/rotations", params={"region_id": "pk_punjab"}).json()
    assert rots and all(r["region_id"] == "pk_punjab" for r in rots)
    assert not any("(current)" in r["label"] for r in rots)
    regions = client.get("/api/v1/regions").json()
    assert {r["region_id"] for r in regions} == {"pk_punjab", "pk_sindh", "pk_kp", "pk_balochistan"}
    assert all({"lat_min", "lat_max", "lon_min", "lon_max"} <= set(r["bbox"]) for r in regions)


def test_power_window_masks_minus_999_before_date_slicing(real_catalog: Any) -> None:
    """Mask `-999` as NaN BEFORE calendar slicing, so missing days never shift a window."""
    end_d = date(2026, 6, 30)
    start_d = end_d - timedelta(days=29)
    rain, t2m, tmax, tmin = {}, {}, {}, {}
    for offset in range(30):
        d = start_d + timedelta(days=offset)
        k = d.strftime("%Y%m%d")
        rain[k] = 100.0 if d < end_d - timedelta(days=6) else (10.0 if d <= end_d - timedelta(days=2) else -999.0)
        ok = d <= end_d - timedelta(days=2)
        t2m[k], tmax[k], tmin[k] = (28.0, 33.0, 22.0) if ok else (-999.0, -999.0, -999.0)
    payload = {"properties": {"parameter": {"PRECTOTCORR": rain, "T2M": t2m, "T2M_MAX": tmax, "T2M_MIN": tmin}}}
    df = parse_power_daily_payload(payload, start_date=start_d, end_date=end_d)
    summary = summarize_power_window(df, end_date=end_d)
    assert summary["rain_7d_mm"] == 50.0
    assert summary["latest_dates"]["power"] == "2026-06-28"

    now_cfg = real_catalog.parameters["now"]
    assert classify_now_conditions({"rain_14d_mm": 25.0, "max_temp_7d_c": 31.0}, now_cfg, "limited")[0] == "FAVORABLE"
    assert classify_now_conditions({"rain_14d_mm": 12.0, "max_temp_7d_c": 36.5}, now_cfg, "reliable")[0] == "WATCH"
    assert classify_now_conditions({"rain_14d_mm": 1.0, "max_temp_7d_c": 41.2}, now_cfg, "none")[0] == "STRESSED"
