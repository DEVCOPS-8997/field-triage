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


def test_sindh_region_supported(client, fake):
    # Hyderabad, Sindh: inside both the Sindh and Balochistan rectangles; offline -> file order (Sindh)
    r = post(client, location={"lat": 25.40, "lon": 68.37}, current_crop=None, current_rotation_id="rot_pk_sindh_cotton_wheat")
    assert r.status_code == 200 and r.json()["location"]["region_id"] == "pk_sindh"
    assert any("provincial border" in w for w in r.json()["warnings"])


def test_crop_mapping(client, fake):
    r = post(client)
    assert r.status_code == 200 and r.json()["location"]["current_rotation_id"] == "rot_pk_rice_wheat"
    # A crop found in several rotations is auto-picked deterministically, with a warning to check it
    r = post(client, current_crop="wheat")
    assert r.status_code == 200 and r.json()["location"]["current_rotation_id"] == "rot_pk_cotton_wheat"
    assert any("we assumed your current rotation" in w for w in r.json()["warnings"])
    assert post(client, current_crop="banana").status_code == 422  # unknown
    assert post(client, current_crop=None).status_code == 422  # nothing provided
    assert post(client, current_crop=None, current_rotation_id="rot_us_corn_soy").status_code == 422


# ---- success, schema, engine ----------------------------------------------------------
def test_success_schema_and_engine(client, fake):
    d = post(client).json()
    assert d["analysis_type"] == "historical_rotation_suitability"
    assert d["data_mode"] == "observed"
    assert d["data_quality"]["power"] == "observed"
    # Sources the GPS pipeline never fetches are not listed at all; attempted ones report their status
    assert "smap" not in d["data_quality"] and "modis" not in d["data_quality"]
    for k in ("soil", "terrain"):
        assert d["data_quality"][k] == "unavailable"
    assert d["income_status"] is not None and "scored" in d["income_status"]
    for r in d["rotations"]:
        assert all(i["title"] and i["detail"] for i in r["insights"])
        assert all(e["value"] is not None for e in r["evidence"])
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
    assert result["profile"]["data_quality"]["soil"] == "derived"
    assert result["profile"]["data_quality"]["terrain"] == "derived"


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


# ---- live profile, current status, cache-aware rate limit ----------------------------------------
def test_response_carries_live_profile_and_now_status(client, fake):
    d = post(client).json()
    assert d["profile"]["field_id"].startswith("LOC_") and d["profile"]["monthly"]
    assert d["now_status"] in ("FAVORABLE", "WATCH", "STRESSED") and d["now_reasons"]
    assert d["data_retrieval"]["power_parameters"][:4] == ["PRECTOTCORR", "T2M", "T2M_MAX", "T2M_MIN"]
    # synthetic payload has no radiation/humidity, so ETo is Hargreaves-derived but present
    assert any(m.get("eto_mm") for m in d["profile"]["monthly"])
    assert d["profile"]["climatology"]["eto_annual_mm_mean"] > 0


def test_rate_limit_counts_only_requests_that_call_providers(settings, fake, monkeypatch):
    reset_rate_limits()
    monkeypatch.setattr("app.services.location_data.is_cached", lambda s, lat, lon: True)
    c = TestClient(create_app(replace(settings, location_rate_limit_per_minute=1)))
    assert post(c).status_code == 200  # first call fetches POWER: counted
    for _ in range(3):  # slider re-scoring on cached data is not limited
        assert post(c, priorities={"w_water": 0.7, "w_soil": 0.1, "w_income": 0.1, "w_resilience": 0.1}).status_code == 200
    assert post(c, location={"lat": 32.2, "lon": 73.1}).status_code == 429  # new cell needs NASA


def test_soil_texture_feeds_awc_soil_type_and_water_balance(client, monkeypatch, fake):
    providers = {
        "soil": {"status": "available", "provider": "ISRIC SoilGrids v2.0", "product": "SoilGrids",
                 "values": {"soil_clay_pct": 21.5, "soil_sand_pct": 38.4, "soil_soc_g_kg": 8.2, "soil_ph": 8.6}},
        "terrain": {"status": "unavailable", "provider": "x", "reason": "mocked", "value": None},
    }
    monkeypatch.setattr("app.services.location_profile.get_location_data", lambda s, lat, lon: providers)
    d = post(client).json()
    assert d["location"]["soil_texture_class"] == "loam"
    assert 0.12 < d["profile"]["soil"]["soil_awc_m3m3"] < 0.16
    ev = {e["variable"]: e for e in d["rotations"][0]["evidence"]}
    assert "soil_awc_m3m3" in ev and "mean_season_water_demand_mm" in ev
    assert any("pH is 8.6" in item for item in d["rotations"][0]["needs_local_review"])


# ---- region/rotation lookup used by the location page -------------------------------------
WAH_CANTT = {"lat": 33.74055, "lon": 72.79651}


def test_region_lists_only_regional_rotations_for_wah_cantt(client, fake):
    r = client.get("/api/v1/locations/region", params=WAH_CANTT)
    body = r.json()
    assert r.status_code == 200 and body["region_id"] == "pk_punjab"
    assert body["rotations"] and {x["region_id"] for x in body["rotations"]} == {"pk_punjab"}
    assert fake.calls == []  # lookup never calls NASA


def test_region_rejects_unsupported_location(client, fake):
    r = client.get("/api/v1/locations/region", params={"lat": 0.0, "lon": 0.0})
    assert r.status_code == 422 and "outside the supported regions" in r.json()["detail"]


def test_region_rotation_is_accepted_by_compare(client, fake):
    rid = client.get("/api/v1/locations/region", params=WAH_CANTT).json()["rotations"][0]["rotation_id"]
    r = post(client, location=WAH_CANTT, current_crop=None, current_rotation_id=rid)
    assert r.status_code == 200 and len(r.json()["rotations"]) >= 3


@pytest.mark.parametrize("origin", ["http://127.0.0.1:5174", "http://localhost:5199"])
def test_cors_allows_any_loopback_dev_port(client, origin):
    r = client.get("/api/v1/rotations", headers={"Origin": origin})
    assert r.headers.get("access-control-allow-origin") == origin


def test_cors_rejects_foreign_origin(client):
    r = client.get("/api/v1/rotations", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in r.headers
