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
    def timeout(*a, **k): raise httpx.ReadTimeout("timeout")
    monkeypatch.setattr(location_data.httpx, "get", timeout)
    result = location_data._soil(settings, 31.4, 73.1)
    assert result["status"] == "unavailable" and "ReadTimeout" in result["reason"]


def test_copernicus_dem_samples_elevation_and_derives_slope(tmp_path, monkeypatch):
    settings = _settings(tmp_path)

    class Dataset:
        height = width = 100
        transform = type("Transform", (), {"a": 30 / (111320 * np.cos(np.radians(31.4))), "e": -30 / 110574})()
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def index(self, lon, lat): return (50, 50)
        def read(self, band, *, window, masked):
            return np.ma.array([[99, 100, 101], [99, 100, 101], [99, 101, 103]], mask=False)

    monkeypatch.setattr(rasterio, "open", lambda url: Dataset())
    result = location_data._terrain(settings, 31.4, 73.1)
    assert result["status"] == "available"
    assert result["value"]["elevation_m"] == 100.0
    assert result["value"]["slope_deg"] > 0
    assert "Copernicus DEM GLO-30" in result["product"]


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
    monkeypatch.setattr("app.api.locations.get_location_data", lambda s, lat, lon: (calls.append((lat, lon)) or expected))
    response = TestClient(create_app(settings)).get("/api/v1/locations/data?lat=0&lon=0")
    assert response.status_code == 200
    assert response.json()["providers"] == expected
    assert calls == [(0.0, 0.0)]  # Outside every crop recommendation region.
