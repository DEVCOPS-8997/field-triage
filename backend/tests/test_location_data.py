from __future__ import annotations

from dataclasses import replace
import httpx
import numpy as np
import rasterio
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app
from app.services import location_data


def _settings(tmp_path):
    return replace(
        get_settings(data_mode="demo"),
        location_data_cache_dir=tmp_path / "cache", location_provider_timeout_seconds=0.2,
    )


def test_soilgrids_converts_depth_weighted_native_units_and_caches(tmp_path, monkeypatch):
    settings = _settings(tmp_path)
    calls = []

    class Response:
        status_code = 200
        headers: dict = {}
        def raise_for_status(self): pass
        def json(self):
            return {"properties": {"layers": [
                {"name": name, "depths": [{"depth": {"top_depth": 0, "bottom_depth": 5}, "values": {"mean": v}},
                                            {"depth": {"top_depth": 5, "bottom_depth": 15}, "values": {"mean": v}},
                                            {"depth": {"top_depth": 15, "bottom_depth": 30}, "values": {"mean": v}}]}
                for name, v in (("clay", 300), ("sand", 400), ("soc", 20), ("phh2o", 75))
            ]}}

    monkeypatch.setattr(location_data.httpx, "get", lambda *a, **k: (calls.append(a[0]) or Response()))
    first = location_data._soil(settings, 31.4, 73.1)
    second = location_data._soil(settings, 31.4, 73.1)
    assert first["status"] == "available"
    assert first["values"] == {"soil_clay_pct": 30.0, "soil_sand_pct": 40.0, "soil_soc_g_kg": 2.0, "soil_ph": 7.5}
    assert second["cache"] == "hit" and len(calls) == 1


def test_soilgrids_timeout_is_provider_unavailable(tmp_path, monkeypatch):
    settings = _settings(tmp_path)
    monkeypatch.setattr(location_data.time, "sleep", lambda s: None)
    def timeout(*a, **k): raise httpx.ReadTimeout("timeout")
    monkeypatch.setattr(location_data.httpx, "get", timeout)
    result = location_data._soil(settings, 31.4, 73.1)
    assert result["status"] == "unavailable" and "ReadTimeout" in result["reason"]


def test_copernicus_dem_plane_fit_slope_over_window(tmp_path, monkeypatch):
    """A synthetic 2 % east-facing grade (30 m pixels) must give atan(0.02) = 1.146 deg."""
    settings = _settings(tmp_path)
    reads = {}

    class Dataset:
        height = width = 100
        nodata = None
        transform = type("Transform", (), {"a": 30 / (111320 * np.cos(np.radians(31.4))), "e": -30 / 110574})()
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def index(self, lon, lat): return (50, 50)
        def read(self, band, *, window, masked, boundless):
            reads["shape"] = (window.height, window.width)
            cols = np.arange(window.width, dtype=float)
            z = 100.0 + 0.02 * 30.0 * (cols - window.width // 2)
            return np.ma.array(np.tile(z, (window.height, 1)), mask=False)

    monkeypatch.setattr(rasterio, "open", lambda url: Dataset())
    result = location_data._terrain(settings, 31.4, 73.1)
    assert result["status"] == "available"
    assert reads["shape"] == (11, 11)  # ~330 m window, not a 3x3 pixel gradient
    assert result["value"]["elevation_m"] == 100.0
    assert abs(result["value"]["slope_deg"] - 1.146) < 0.01
    assert "Copernicus DEM GLO-30" in result["product"]


def test_plane_fit_ignores_masked_edge_pixels():
    z = np.ma.array(np.zeros((11, 11)), mask=np.zeros((11, 11), dtype=bool))
    z.mask[:, :3] = True  # tile edge
    assert location_data.plane_fit_slope_deg(z, 30.0, 30.0) == 0.0
    z.mask[:, :] = True
    assert location_data.plane_fit_slope_deg(z, 30.0, 30.0) is None


def _soil_payload(v):
    return {"properties": {"layers": [
        {"name": name, "unit_measure": {"d_factor": 10}, "depths": [
            {"range": {"top_depth": 0, "bottom_depth": 30}, "values": {"mean": val}}]}
        for name, val in (("clay", v), ("sand", v), ("soc", v), ("phh2o", v))
    ]}}


def test_soilgrids_masked_point_uses_nearest_valid_pixel(tmp_path, monkeypatch):
    settings = _settings(tmp_path)
    calls = []

    class R:
        status_code = 200
        headers: dict = {}
        def __init__(self, v): self.v = v
        def raise_for_status(self): pass
        def json(self): return _soil_payload(self.v)

    def fake_get(url, params, timeout):
        calls.append(params)
        return R(None if len(calls) == 1 else 250)  # centre masked (urban), first neighbour valid

    monkeypatch.setattr(location_data.httpx, "get", fake_get)
    out = location_data._soil(settings, 31.4, 73.1)
    assert out["status"] == "available" and out["sample_offset_m"] == 300.0
    assert out["values"]["soil_clay_pct"] == 25.0 and "masked" in out["sample_note"]
    assert len(calls) == 2


def test_soilgrids_all_masked_is_unavailable_and_negatively_cached(tmp_path, monkeypatch):
    settings = _settings(tmp_path)
    calls = []

    class R:
        status_code = 200
        headers: dict = {}
        def raise_for_status(self): pass
        def json(self): return _soil_payload(None)

    monkeypatch.setattr(location_data.httpx, "get", lambda *a, **k: (calls.append(1) or R()))
    first = location_data._soil(settings, 31.4, 73.1)
    second = location_data._soil(settings, 31.4, 73.1)
    assert first["status"] == "unavailable" and "mask" in first["reason"]
    assert second["cache"] == "hit" and len(calls) == 5  # point + 4 neighbours, then cached


def test_soilgrids_retries_once_on_throttling(tmp_path, monkeypatch):
    settings = _settings(tmp_path)
    monkeypatch.setattr(location_data.time, "sleep", lambda s: None)
    responses = []

    class R:
        headers = {"retry-after": "1"}
        def __init__(self, code): self.status_code = code
        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError("throttled", request=None, response=None)
        def json(self): return _soil_payload(300)

    def fake_get(*a, **k):
        responses.append(1)
        return R(429 if len(responses) == 1 else 200)

    monkeypatch.setattr(location_data.httpx, "get", fake_get)
    assert location_data._soil(settings, 31.4, 73.1)["status"] == "available" and len(responses) == 2


def test_failed_providers_do_not_abort_bundle(tmp_path, monkeypatch):
    settings = _settings(tmp_path)
    monkeypatch.setattr(location_data, "_soil", lambda *a: {"status": "unavailable", "value": None})
    monkeypatch.setattr(location_data, "_terrain", lambda *a: {"status": "unavailable", "value": None})
    result = location_data.get_location_data(settings, 31.4, 73.1)
    assert set(result) == {"soil", "terrain"}
    assert all(item["status"] == "unavailable" for item in result.values())


def test_unexpected_provider_error_does_not_block_other_provider(tmp_path, monkeypatch):
    settings = _settings(tmp_path)
    monkeypatch.setattr(location_data, "_soil", lambda *a: (_ for _ in ()).throw(RuntimeError("provider failure")))
    monkeypatch.setattr(location_data, "_terrain", lambda *a: {"status": "available", "value": {"elevation_m": 5.0}})
    result = location_data.get_location_data(settings, 31.4, 73.1)
    assert result["soil"]["status"] == "unavailable"
    assert result["terrain"]["status"] == "available"


def test_global_point_data_route_does_not_require_crop_region(tmp_path, monkeypatch):
    settings = _settings(tmp_path)
    expected = {
        "soil": {"status": "available", "values": {"soil_ph": 7.1}},
        "terrain": {"status": "available", "value": {"elevation_m": 40.0, "slope_deg": 1.0}},
    }
    calls = []
    monkeypatch.setattr("app.services.location_data.get_location_data", lambda s, lat, lon: (calls.append((lat, lon)) or expected))
    response = TestClient(create_app(settings)).get("/api/v1/locations/data?lat=0&lon=0")
    assert response.status_code == 200
    assert response.json()["providers"] == expected
    assert calls == [(0.0, 0.0)]  # Outside every crop recommendation region.
