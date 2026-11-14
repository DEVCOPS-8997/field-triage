"""End-to-end API, error-code, CORS, OpenAPI `/docs`, and Tier 3 `/now` tests (`test_api.py`)."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
import httpx
import pytest

from app.config import Settings, get_settings
from app.main import create_app
from app.models.schemas import CompareResponse, FieldInfo, FieldProfile
from app.services.power_live import (
    classify_now_conditions,
    fetch_and_evaluate_now,
    parse_power_daily_payload,
    summarize_power_window,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
REAL_DATA_DIR = REPO_ROOT / "data"


def test_health_docs_openapi_and_cors(
    demo_settings: Settings,
    processed_settings: Settings,
) -> None:
    """Verify `/api/v1/health`, `/docs`, `/openapi.json`, and CORS for localhost:5173."""
    demo_client = TestClient(create_app(settings=demo_settings))
    proc_client = TestClient(create_app(settings=processed_settings))

    h_demo = demo_client.get(
        "/api/v1/health", headers={"Origin": "http://localhost:5173"}
    )
    assert h_demo.status_code == 200
    assert h_demo.json() == {
        "status": "ok",
        "service": "field-shift-advisor",
        "data_mode": "demo",
    }
    assert h_demo.headers.get("access-control-allow-origin") == "http://localhost:5173"

    h_proc = proc_client.get("/api/v1/health")
    assert h_proc.status_code == 200
    assert h_proc.json()["data_mode"] == "observed"

    docs_resp = demo_client.get("/docs")
    assert docs_resp.status_code == 200
    assert "Swagger UI" in docs_resp.text or "openapi" in docs_resp.text.lower()

    schema_resp = demo_client.get("/openapi.json")
    assert schema_resp.status_code == 200
    paths = schema_resp.json()["paths"]
    for required_path in (
        "/api/v1/health",
        "/api/v1/fields",
        "/api/v1/fields/{field_id}/profile",
        "/api/v1/rotations/compare",
        "/api/v1/crops",
        "/api/v1/rotations",
        "/api/v1/meta/sources",
        "/api/v1/fields/{field_id}/now",
    ):
        assert required_path in paths


def test_catalog_and_profile_endpoints(demo_settings: Settings) -> None:
    """Verify `/fields`, `/fields/{id}/profile`, `/crops`, `/rotations`, and `/meta/sources`."""
    client = TestClient(create_app(settings=demo_settings))

    fields_resp = client.get("/api/v1/fields")
    assert fields_resp.status_code == 200
    fields_data = fields_resp.json()
    assert len(fields_data) == 8
    FieldInfo.model_validate(fields_data[0])

    prof_resp = client.get("/api/v1/fields/F01/profile")
    assert prof_resp.status_code == 200
    prof_model = FieldProfile.model_validate(prof_resp.json())
    assert prof_model.field_id == "F01"
    assert prof_model.data_mode == "demo"

    crops_resp = client.get("/api/v1/crops")
    assert crops_resp.status_code == 200
    assert len(crops_resp.json()) == 10

    rots_all = client.get("/api/v1/rotations")
    assert rots_all.status_code == 200
    assert len(rots_all.json()) == 10

    rots_pk = client.get("/api/v1/rotations", params={"region_id": "pk_punjab"})
    assert rots_pk.status_code == 200
    assert len(rots_pk.json()) == 5
    assert all(r["region_id"] == "pk_punjab" for r in rots_pk.json())

    meta_resp = client.get("/api/v1/meta/sources")
    assert meta_resp.status_code == 200
    assert len(meta_resp.json()) == 15


def test_compare_rotations_across_all_eight_fields_and_modes(
    demo_settings: Settings,
    processed_settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure `/rotations/compare` works for F01..F08 in demo & processed modes with zero HTTP calls."""
    # Forbid any outbound httpx.Client network call during rotation comparison
    def _forbid_network(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("POST /api/v1/rotations/compare must never make external network calls!")

    monkeypatch.setattr(httpx.Client, "get", _forbid_network)

    demo_client = TestClient(create_app(settings=demo_settings))
    proc_client = TestClient(create_app(settings=processed_settings))

    for idx in range(1, 9):
        fid = f"F0{idx}"
        r_demo = demo_client.post(
            "/api/v1/rotations/compare",
            json={
                "field_id": fid,
                "priorities": {
                    "w_water": 0.30,
                    "w_soil": 0.25,
                    "w_income": 0.20,
                    "w_resilience": 0.25,
                },
                "scenario": {"rain_multiplier": 0.9, "temp_delta_c": 1.0},
            },
        )
        assert r_demo.status_code == 200
        parsed_demo = CompareResponse.model_validate(r_demo.json())
        assert parsed_demo.field_id == fid
        assert parsed_demo.data_mode == "demo"
        assert parsed_demo.scenario_applied is True
        assert len(parsed_demo.rotations) >= 3
        assert sum(1 for rot in parsed_demo.rotations if rot.is_existing) == 1
        assert [rot.rank for rot in parsed_demo.rotations] == list(
            range(1, len(parsed_demo.rotations) + 1)
        )

        r_proc = proc_client.post("/api/v1/rotations/compare", json={"field_id": fid})
        assert r_proc.status_code == 200
        parsed_proc = CompareResponse.model_validate(r_proc.json())
        assert parsed_proc.data_mode == "observed"
        # Because parameters.json has validated=false, confidence in observed mode is MEDIUM (not HIGH)
        assert all(rot.confidence == "MEDIUM" for rot in parsed_proc.rotations)


def test_http_error_status_codes_404_422_503(demo_settings: Settings) -> None:
    """Verify strict HTTP status codes: 404 unknown field, 422 invalid input, 503 missing profile."""
    client = TestClient(create_app(settings=demo_settings))

    # 404 Unknown field
    assert client.get("/api/v1/fields/UNKNOWN_FIELD/profile").status_code == 404
    assert (
        client.post("/api/v1/rotations/compare", json={"field_id": "UNKNOWN_FIELD"}).status_code
        == 404
    )

    # 422 Invalid priority weights (sum != 1.0)
    r_bad_prio = client.post(
        "/api/v1/rotations/compare",
        json={
            "field_id": "F01",
            "priorities": {
                "w_water": 0.5,
                "w_soil": 0.5,
                "w_income": 0.5,
                "w_resilience": 0.5,
            },
        },
    )
    assert r_bad_prio.status_code == 422

    # 422 Invalid scenario range (rain_multiplier > 1.4)
    r_bad_scen = client.post(
        "/api/v1/rotations/compare",
        json={"field_id": "F01", "scenario": {"rain_multiplier": 2.0, "temp_delta_c": 0.0}},
    )
    assert r_bad_scen.status_code == 422

    # 422 Cross-region rotation ID for F01 (pk_punjab vs us_midwest)
    r_cross_reg = client.post(
        "/api/v1/rotations/compare",
        json={
            "field_id": "F01",
            "rotation_ids": [
                "rot_pk_cotton_wheat",
                "rot_pk_sorghum_chickpea",
                "rot_us_corn_soy",
            ],
        },
    )
    assert r_cross_reg.status_code == 422

    # 503 Missing profile when pointing at real repo `data/` before M1 commits demo profiles
    real_repo_client = TestClient(
        create_app(settings=get_settings(data_mode="demo", data_dir=REAL_DATA_DIR))
    )
    if not (REAL_DATA_DIR / "demo" / "profiles" / "F01.json").exists():
        assert real_repo_client.get("/api/v1/fields/F01/profile").status_code == 503
        assert (
            real_repo_client.post("/api/v1/rotations/compare", json={"field_id": "F01"}).status_code
            == 503
        )


def test_tier3_power_live_masks_minus_999_before_date_slicing(
    real_catalog: Any,
    demo_settings: Settings,
) -> None:
    """Verify Execution Plan Section 0.7 fix: mask `-999` as NaN BEFORE calendar date slicing."""
    end_d = date(2026, 6, 30)
    start_d = end_d - timedelta(days=29)

    # Put 100 mm rain on days outside the last 7 days, 10 mm on 5 of the last 7 days,
    # and -999 on the final 2 days.
    # Correct calendar-window slicing gives 5 * 10 = 50.0 mm (NOT 5*10 + 2*100 = 250 mm!).
    rain_map: dict[str, float] = {}
    t2m_map: dict[str, float] = {}
    tmax_map: dict[str, float] = {}
    tmin_map: dict[str, float] = {}

    for offset in range(30):
        d = start_d + timedelta(days=offset)
        key = d.strftime("%Y%m%d")
        if d < end_d - timedelta(days=6):
            rain_map[key] = 100.0
        elif d <= end_d - timedelta(days=2):
            rain_map[key] = 10.0
        else:
            rain_map[key] = -999.0
        t2m_map[key] = 28.0 if d <= end_d - timedelta(days=2) else -999.0
        tmax_map[key] = 33.0 if d <= end_d - timedelta(days=2) else -999.0
        tmin_map[key] = 22.0 if d <= end_d - timedelta(days=2) else -999.0

    payload = {
        "properties": {
            "parameter": {
                "PRECTOTCORR": rain_map,
                "T2M": t2m_map,
                "T2M_MAX": tmax_map,
                "T2M_MIN": tmin_map,
            }
        }
    }
    df = parse_power_daily_payload(payload, start_date=start_d, end_date=end_d)
    summary = summarize_power_window(df, end_date=end_d)
    assert summary["rain_7d_mm"] == 50.0
    assert summary["latest_dates"]["power"] == "2026-06-28"

    # Verify FAVORABLE / WATCH / STRESSED classifier
    now_cfg = real_catalog.parameters["now"]
    st_fav, _ = classify_now_conditions(
        {"rain_14d_mm": 25.0, "max_temp_7d_c": 31.0}, now_cfg, "limited"
    )
    assert st_fav == "FAVORABLE"

    st_watch, _ = classify_now_conditions(
        {"rain_14d_mm": 12.0, "max_temp_7d_c": 36.5}, now_cfg, "reliable"
    )
    assert st_watch == "WATCH"

    st_stress, _ = classify_now_conditions(
        {"rain_14d_mm": 1.0, "max_temp_7d_c": 41.2}, now_cfg, "none"
    )
    assert st_stress == "STRESSED"

    # Mock httpx transport for fetch_and_evaluate_now (zero external network traffic)
    f01 = real_catalog.fields_by_id["F01"]
    mock_transport = httpx.MockTransport(lambda _req: httpx.Response(200, json=payload))
    with httpx.Client(transport=mock_transport) as mock_client:
        now_res = fetch_and_evaluate_now(
            field=f01,
            parameters=real_catalog.parameters,
            settings=demo_settings,
            reference_date=end_d + timedelta(days=5),
            http_client=mock_client,
        )
    assert now_res.field_id == "F01"
    assert now_res.now_status == "FAVORABLE"
    assert now_res.data_mode == "observed"

    # Verify graceful fallback to local_profile.now when external NASA POWER fails
    fail_transport = httpx.MockTransport(lambda _req: httpx.Response(503, text="Upstream down"))
    from app.services.data_loader import DataLoader

    local_prof = DataLoader(settings=demo_settings).load_field_profile("F01")
    from app.services.power_live import clear_power_live_cache

    clear_power_live_cache()
    with httpx.Client(transport=fail_transport) as fail_client:
        fallback_res = fetch_and_evaluate_now(
            field=f01,
            parameters=real_catalog.parameters,
            settings=demo_settings,
            local_profile=local_prof,
            reference_date=end_d + timedelta(days=5),
            http_client=fail_client,
        )
    assert fallback_res.data_mode == "demo"

    # Exercise GET /api/v1/fields/{id}/now HTTP endpoint via FastAPI TestClient without real network
    clear_power_live_cache()
    orig_client_cls = httpx.Client

    def _mocked_client_factory(*args: Any, **kwargs: Any) -> httpx.Client:
        kwargs["transport"] = mock_transport
        return orig_client_cls(*args, **kwargs)

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(httpx, "Client", _mocked_client_factory)
        api_client = TestClient(create_app(settings=demo_settings))
        http_now = api_client.get("/api/v1/fields/F01/now")
        assert http_now.status_code == 200
        assert http_now.json()["field_id"] == "F01"
        assert http_now.json()["now_status"] in ("FAVORABLE", "WATCH", "STRESSED")
        assert api_client.get("/api/v1/fields/UNKNOWN/now").status_code == 404

