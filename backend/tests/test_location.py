"""Dynamic location workflow. NASA POWER is always mocked; payloads are SYNTHETIC test data."""

from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
import threading

from fastapi.testclient import TestClient
import httpx
import pytest

from app.config import get_settings
from app.main import create_app
from app.services import power_history
from app.services.rate_limit import reset_rate_limits

PK = {"lat": 31.42, "lon": 73.08}
BODY = {"location": PK, "irrigation": "limited", "current_crop": "rice"}


def _payload(start: str, end: str, missing_rain=False) -> dict:
    s = datetime.strptime(start, "%Y%m%d").date()
    e = datetime.strptime(end, "%Y%m%d").date()
    out = {"PRECTOTCORR": {}, "T2M": {}, "T2M_MAX": {}, "T2M_MIN": {}}
    d = s
    while d <= e:
        k = d.strftime("%Y%m%d")
        warm = 14 * (1 - abs(d.month - 7) / 6)  # synthetic seasonal curve
        out["T2M"][k] = 16 + warm
        out["T2M_MAX"][k] = 22 + warm
        out["T2M_MIN"][k] = 10 + warm
        out["PRECTOTCORR"][k] = -999.0 if (missing_rain and d.month == 3 and (missing_rain is True or d.year == missing_rain)) else (8.0 if d.month in (7, 8) else 0.5)
        d += timedelta(days=1)
    return {"properties": {"parameter": out}}


class FakePower:
    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.fail = False
        self.missing_rain = False

    def __call__(self, settings, params):
        self.calls.append(params)
        if self.fail:
            raise httpx.ConnectError("synthetic outage")
        return _payload(params["start"], params["end"], self.missing_rain)


@pytest.fixture
def fake(monkeypatch):
    f = FakePower()
    monkeypatch.setattr(power_history, "_request_power", f)
    return f


@pytest.fixture(autouse=True)
def _mock_location_providers(monkeypatch):
    # Provider behavior is isolated in test_location_data.py; endpoint compatibility stays offline.
    monkeypatch.setattr(
        "app.services.location_profile.get_location_data",
        lambda settings, lat, lon: {
            key: {"status": "unavailable", "provider": key, "reason": "mocked in endpoint test", "value": None}
            for key in ("soil", "terrain")
        },
    )


@pytest.fixture
def settings(tmp_path):
    return replace(
        get_settings(data_mode="demo"),
        power_cache_dir=tmp_path / "cache",
        power_history_start_year=2015,
        location_rate_limit_per_minute=0,
    )


@pytest.fixture
def client(settings):
    reset_rate_limits()
    power_history.clear_power_history_memory()
    return TestClient(create_app(settings))


def post(client, **over):
    return client.post("/api/v1/locations/compare", json={**BODY, **over})


# ---- validation -------------------------------------------------------------------------
def test_invalid_coordinates_rejected(client, fake):
    assert post(client, location={"lat": 91, "lon": 0}).status_code == 422
    assert post(client, location={"lat": 0, "lon": 181}).status_code == 422
    assert fake.calls == []


def test_unsupported_region_rejected_without_fallback(client, fake):
    r = post(client, location={"lat": 0.0, "lon": 0.0})
    assert r.status_code == 422 and "outside the supported regions" in r.json()["detail"]
    assert fake.calls == []  # no NASA call for unsupported places


def test_us_region_supported(client, fake):
    r = post(client, location={"lat": 41.5, "lon": -93.5}, current_crop=None, current_rotation_id="rot_us_corn_soy")
    assert r.status_code == 200 and r.json()["location"]["region_id"] == "us_midwest"


def test_crop_mapping(client, fake):
    r = post(client)
    assert r.status_code == 200 and r.json()["location"]["current_rotation_id"] == "rot_pk_rice_wheat"
    assert post(client, current_crop="wheat").status_code == 422  # ambiguous
    assert post(client, current_crop="banana").status_code == 422  # unknown
    assert post(client, current_crop=None).status_code == 422  # nothing provided
    assert post(client, current_crop=None, current_rotation_id="rot_us_corn_soy").status_code == 422


# ---- success, schema, engine ----------------------------------------------------------
def test_success_schema_and_engine(client, fake):
    d = post(client).json()
    assert d["analysis_type"] == "historical_rotation_suitability"
    assert d["data_mode"] == "observed"
    assert d["data_quality"]["power"] == "observed"
    for k in ("smap", "modis", "soil", "terrain"):
        assert d["data_quality"][k] == "unavailable"
    assert len(d["rotations"]) >= 3 and sorted(r["rank"] for r in d["rotations"]) == list(
        range(1, len(d["rotations"]) + 1)
    )
    assert sum(r["is_existing"] for r in d["rotations"]) == 1
    assert any("not a forecast" in w for w in d["warnings"])
    assert "not this exact field" in d["location"]["data_resolution_note"]
    assert all(r["data_gaps"] for r in d["rotations"])  # missing sources are reported


def test_live_soil_and_terrain_reach_temporary_profile_and_engine(client, monkeypatch):
    providers = {
        "soil": {
            "status": "available", "provider": "ISRIC SoilGrids v2.0", "product": "SoilGrids properties mean, 0-30 cm",
            "values": {"soil_clay_pct": 26.5, "soil_sand_pct": 38.3, "soil_soc_g_kg": 20.6, "soil_ph": 6.5},
        },
        "terrain": {
            "status": "available", "provider": "Copernicus DEM GLO-30", "product": "Copernicus DEM GLO-30",
            "value": {"elevation_m": 192.9, "slope_deg": 3.55},
        },
    }
    monkeypatch.setattr("app.services.location_profile.get_location_data", lambda settings, lat, lon: providers)
    original = __import__("app.services.rotation_engine", fromlist=["evaluate_rotations"]).evaluate_rotations
    captured = {}

    def inspect_engine(**kwargs):
        captured["soil"] = dict(kwargs["profile"].soil)
        captured["terrain"] = dict(kwargs["profile"].terrain)
        result = original(**kwargs)
        captured["engine_slopes"] = [evaluation.slope_deg_used for evaluation in result.evaluations]
        return result

    monkeypatch.setattr("app.api.locations.evaluate_rotations", inspect_engine)
    result = post(client).json()
    assert captured["soil"]["soil_clay_pct"] == 26.5
    assert captured["terrain"]["elevation_m"] == 192.9
    assert captured["terrain"]["slope_deg"] == 3.55
    assert captured["engine_slopes"] and all(slope == 3.55 for slope in captured["engine_slopes"])
    assert result["data_retrieval"]["field_profile"]["data_quality"]["soil"] == "derived"
    assert result["data_retrieval"]["field_profile"]["data_quality"]["terrain"] == "derived"


def test_missing_values_stay_missing(client, settings, fake):
    fake.missing_rain = True
    from app.services.location_profile import build_location_inputs
    from app.services.data_loader import DataLoader

    rots = DataLoader(settings).load_catalog().rotations
    inp = build_location_inputs(
        lat=31.42, lon=73.08, irrigation="limited", current_rotation_id="rot_pk_rice_wheat",
        current_crop=None, rotations=rots, settings=settings,
    )
    march = [m for m in inp.profile.monthly if m.month == 3]
    assert march and all(m.rain_mm is None for m in march)  # never zero
    assert inp.profile.field_id.startswith("LOC_") and inp.profile.data_mode == "observed"
    assert all(v is None for v in inp.profile.soil.values())


def test_single_year_gap_still_works_but_total_gap_is_refused(client, settings, fake):
    fake.missing_rain = 2020  # one missing March only
    assert post(client).status_code == 200
    power_history.clear_power_history_memory()
    for f in settings.power_cache_dir.glob("*.json"):
        f.unlink()
    fake.missing_rain = True  # March missing in every year: no complete wheat season exists
    r = post(client)
    assert r.status_code == 503 and "zero complete seasonal climate windows" in r.json()["detail"]


# ---- caching ----------------------------------------------------------------------------
def test_cache_shared_by_grid_cell(client, fake):
    assert post(client).json()["data_retrieval"]["source"] == "live"
    r2 = post(client, location={"lat": 31.30, "lon": 73.10})  # same 0.5 degree cell
    assert r2.json()["data_retrieval"]["source"] == "cache"
    assert len(fake.calls) == 1
    post(client, location={"lat": 32.2, "lon": 73.1})  # different cell
    assert len(fake.calls) == 2


def test_cache_expiry_refreshes_recent_only(settings, fake):
    t0 = datetime.now(timezone.utc)
    h1 = power_history.get_power_history(31.4, 73.1, settings, now=t0)
    assert h1.source == "live"
    t1 = t0 + timedelta(hours=settings.power_history_ttl_hours + 1, days=3)
    h2 = power_history.get_power_history(31.4, 73.1, settings, now=t1)
    assert h2.source == "refreshed" and len(fake.calls) == 2
    refetch_start = datetime.strptime(fake.calls[1]["start"], "%Y%m%d").date()
    assert refetch_start > date(2015, 1, 1) + timedelta(days=365)  # history is not refetched
    assert h2.end > h1.end
    # within TTL: no call
    power_history.get_power_history(31.4, 73.1, settings, now=t1 + timedelta(minutes=5))
    assert len(fake.calls) == 2


def test_stale_cache_used_when_nasa_down(settings, fake):
    t0 = datetime.now(timezone.utc)
    power_history.get_power_history(31.4, 73.1, settings, now=t0)
    fake.fail = True
    h = power_history.get_power_history(31.4, 73.1, settings, now=t0 + timedelta(days=5))
    assert h.source == "stale_cache" and "Could not refresh" in h.warning


def test_no_cache_and_nasa_down_returns_503(client, fake):
    fake.fail = True
    r = post(client)
    assert r.status_code == 503 and "No cached NASA POWER data" in r.json()["detail"]


def test_malformed_nasa_payload_is_503(client, monkeypatch):
    monkeypatch.setattr(power_history, "_request_power", lambda s, p: {"nope": 1})
    assert post(client).status_code == 503


def test_concurrent_requests_single_fetch(settings, fake):
    results = []

    def run():
        results.append(power_history.get_power_history(31.4, 73.1, settings).source)

    ts = [threading.Thread(target=run) for _ in range(6)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert len(fake.calls) == 1 and results.count("live") == 1


# ---- rate limiting -------------------------------------------------------------------------
def test_rate_limit(settings, fake):
    reset_rate_limits()
    c = TestClient(create_app(replace(settings, location_rate_limit_per_minute=2)))
    assert post(c).status_code == 200
    assert post(c).status_code == 200
    r = post(c)
    assert r.status_code == 429 and "Retry-After" in r.headers


# ---- existing workflow unaffected --------------------------------------------------------------
def test_pilot_field_compare_still_works():
    c = TestClient(create_app(get_settings(data_mode="demo")))
    r = c.post("/api/v1/rotations/compare", json={"field_id": "F01"})
    assert r.status_code == 200 and r.json()["data_mode"] == "demo"
