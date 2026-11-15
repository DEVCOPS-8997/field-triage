"""MODIS NDVI (MOD13Q1 v061, 250 m, 16-day) for any latitude/longitude.

Provider chain (first one that works wins):
1. ORNL DAAC MODIS Web Service (no login). Some networks cannot complete its TLS handshake, so
   reachability is probed once with a short timeout and remembered for 30 minutes.
2. NASA AppEEARS point request (free NASA Earthdata login in `EARTHDATA_USERNAME` /
   `EARTHDATA_PASSWORD`). Asynchronous: the task usually finishes in a few minutes.
3. Nothing: callers keep the crop-calendar estimate and say so.

Only good (0) and marginal (1) pixel-reliability composites are kept; snow (2), cloud (3) and fill
values are dropped, never turned into zero. Results are cached per ~250 m pixel on disk, so the slow
fetch happens once per field. Retrieval runs in a background thread; `/locations/ndvi` reports
progress and `/locations/compare` merges the result into the profile once it is ready.
"""

from __future__ import annotations

import csv
import io
import json
import math
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from app.config import Settings
from app.models.schemas import FieldProfile

PRODUCT = "MOD13Q1"
APPEEARS_PRODUCT = "MOD13Q1.061"
NDVI_SCALE = 0.0001
GOOD_RELIABILITY = (0, 1)
NDVI_VALID_MIN, NDVI_VALID_MAX = -0.2, 1.0
COMPOSITE_DAYS = 16
PIXEL_DEG = 0.0025  # ~250 m: cache key resolution
ORNL_CHUNK = 10  # the ORNL service returns at most 10 composite dates per subset request
ORNL_PROBE_TTL_S = 1800
ORNL_PROBE_LIMIT_S = 15  # a stalled TLS handshake ignores httpx timeouts, so the probe gets a wall-clock limit
ORNL_FIRST_RESULT_LIMIT_S = 120  # whole ORNL download (~100 small requests, 6 in parallel, ~30 s normally)
USER_AGENT = "FieldShiftAdvisor/1.0 (crop-rotation decision-support tool)"

SOURCE_LABEL = "NASA MODIS Terra MOD13Q1 v061 NDVI (250 m, 16-day composites)"


# --------------------------------------------------------------------------------------------
# Data model
# --------------------------------------------------------------------------------------------
@dataclass
class Composite:
    day: date
    ndvi: float | None
    reliability: int | None


@dataclass
class JobState:
    state: str  # running | ready | failed | not_configured | disabled
    provider: str | None = None
    message: str = ""
    started_at: float = field(default_factory=time.time)
    attempts: list[str] = field(default_factory=list)


_jobs: dict[str, JobState] = {}
_jobs_lock = threading.Lock()
_ornl_probe: dict[str, Any] = {"ok": None, "at": 0.0}
_appeears_token: dict[str, Any] = {"token": None, "exp": 0.0}


def pixel_key(lat: float, lon: float) -> str:
    snap = lambda v: round(round(v / PIXEL_DEG) * PIXEL_DEG, 4)  # noqa: E731
    return f"{snap(lat):.4f}_{snap(lon):.4f}"


def _cache_path(settings: Settings, key: str) -> Path:
    return settings.ndvi_cache_dir / f"ndvi_{key}.json"


def load_cached(settings: Settings, lat: float, lon: float) -> dict[str, Any] | None:
    path = _cache_path(settings, pixel_key(lat, lon))
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


# --------------------------------------------------------------------------------------------
# Aggregation (pure, deterministic)
# --------------------------------------------------------------------------------------------
def _scaled(raw: Any) -> float | None:
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(v):
        return None
    if abs(v) > 1.5:  # raw integer DN -> NDVI
        v *= NDVI_SCALE
    return v if NDVI_VALID_MIN <= v <= NDVI_VALID_MAX else None


def summarize(composites: list[Composite], bare_threshold: float) -> dict[str, Any]:
    """Monthly means, 12-month climatology, bare days per year, peak and latest NDVI."""
    good = sorted(
        (c for c in composites if c.ndvi is not None and (c.reliability in GOOD_RELIABILITY or c.reliability is None)),
        key=lambda c: c.day,
    )
    monthly: dict[tuple[int, int], list[float]] = defaultdict(list)
    for c in good:
        monthly[(c.day.year, c.day.month)].append(float(c.ndvi))  # type: ignore[arg-type]
    monthly_rows = [
        {"year": y, "month": m, "ndvi_mean": round(sum(v) / len(v), 4), "n": len(v)}
        for (y, m), v in sorted(monthly.items())
    ]
    by_month: dict[int, list[float]] = defaultdict(list)
    for r in monthly_rows:
        by_month[r["month"]].append(r["ndvi_mean"])
    clim = [round(sum(by_month[m]) / len(by_month[m]), 4) if by_month.get(m) else None for m in range(1, 13)]

    # Bare days per year: share of good composites below the threshold x 365, over years with
    # at least 12 of the ~23 composites (so a cloudy year does not count as fully bare or green).
    per_year: dict[int, list[float]] = defaultdict(list)
    for c in good:
        per_year[c.day.year].append(float(c.ndvi))  # type: ignore[arg-type]
    bare_years = {
        y: sum(1 for v in vals if v < bare_threshold) / len(vals) * 365.0
        for y, vals in per_year.items()
        if len(vals) >= 12
    }
    bare_mean = round(sum(bare_years.values()) / len(bare_years), 1) if bare_years else None

    valid_clim = [(i + 1, v) for i, v in enumerate(clim) if v is not None]
    peak_month, peak = max(valid_clim, key=lambda t: (t[1], -t[0])) if valid_clim else (None, None)
    latest = good[-1] if good else None
    return {
        "monthly": monthly_rows,
        "ndvi_monthly_mean": clim,
        "ndvi_peak_mean": peak,
        "ndvi_peak_month": peak_month,
        "bare_days_est_mean": bare_mean,
        "bare_days_by_year": {str(y): round(v, 1) for y, v in sorted(bare_years.items())},
        "ndvi_latest": None if latest is None else round(float(latest.ndvi), 4),  # type: ignore[arg-type]
        "ndvi_latest_date": None if latest is None else latest.day.isoformat(),
        "n_composites_total": len(composites),
        "n_composites_good": len(good),
        "period_start": good[0].day.isoformat() if good else None,
        "period_end": good[-1].day.isoformat() if good else None,
        "bare_threshold": bare_threshold,
    }


# --------------------------------------------------------------------------------------------
# Provider 1: ORNL DAAC MODIS Web Service
# --------------------------------------------------------------------------------------------
def ornl_reachable(settings: Settings) -> bool:
    now = time.time()
    if _ornl_probe["ok"] is not None and now - _ornl_probe["at"] < ORNL_PROBE_TTL_S:
        return bool(_ornl_probe["ok"])
    ok = False
    try:
        r = httpx.get(f"{settings.ornl_modis_url}/products", headers={"Accept": "application/json", "User-Agent": USER_AGENT},
                      timeout=httpx.Timeout(12.0, connect=6.0))
        ok = r.status_code == 200
    except httpx.HTTPError:
        ok = False
    _ornl_probe.update(ok=ok, at=now)
    return ok


def _ornl_get(settings: Settings, path: str, params: dict[str, Any]) -> dict[str, Any]:
    r = httpx.get(f"{settings.ornl_modis_url}/{PRODUCT}/{path}", params=params,
                  headers={"Accept": "application/json", "User-Agent": USER_AGENT},
                  timeout=httpx.Timeout(30.0, connect=8.0))
    r.raise_for_status()
    return r.json()


def fetch_ornl(settings: Settings, lat: float, lon: float, start_year: int) -> list[Composite]:
    base = {"latitude": f"{lat:.5f}", "longitude": f"{lon:.5f}"}
    dates = [d["modis_date"] for d in _ornl_get(settings, "dates", base).get("dates", [])
             if int(d.get("calendar_date", "0000")[:4] or 0) >= start_year]
    if not dates:
        raise RuntimeError("ORNL returned no MOD13Q1 dates for this point")
    chunks = [dates[i:i + ORNL_CHUNK] for i in range(0, len(dates), ORNL_CHUNK)]
    values: dict[str, dict[str, Any]] = defaultdict(dict)

    def one(chunk: list[str], band: str) -> None:
        body = _ornl_get(settings, "subset", {**base, "band": band, "startDate": chunk[0], "endDate": chunk[-1],
                                              "kmAboveBelow": 0, "kmLeftRight": 0})
        for row in body.get("subset", []):
            data = row.get("data") or []
            values[row.get("calendar_date")][band] = data[len(data) // 2] if data else None

    jobs = [(c, b) for c in chunks for b in ("250m_16_days_NDVI", "250m_16_days_pixel_reliability")]
    # Canary: one request first, so a network that accepts the probe but stalls on data requests
    # fails in seconds (and ORNL is skipped for 30 minutes) instead of hanging on ~100 requests.
    try:
        one(*jobs[0])
    except (httpx.HTTPError, ValueError) as exc:
        _ornl_probe.update(ok=False, at=time.time())
        raise RuntimeError(f"ORNL data request failed ({type(exc).__name__}); skipping ORNL") from exc
    jobs = jobs[1:]
    with ThreadPoolExecutor(max_workers=6) as pool:
        for fut in [pool.submit(one, c, b) for c, b in jobs]:
            fut.result()
    out: list[Composite] = []
    for day, bands in values.items():
        if not day:
            continue
        rel = bands.get("250m_16_days_pixel_reliability")
        out.append(Composite(date.fromisoformat(day), _scaled(bands.get("250m_16_days_NDVI")),
                             None if rel is None else int(rel)))
    return out


# --------------------------------------------------------------------------------------------
# Provider 2: NASA AppEEARS (Earthdata login)
# --------------------------------------------------------------------------------------------
RETRY_DELAYS_S = (2, 5, 10, 20, 40)  # transient DNS / connection blips must not kill a long task


def _request(method: str, url: str, **kw: Any) -> httpx.Response:
    """HTTP call that retries transport errors (DNS failure, reset, timeout) and 5xx answers."""
    last: Exception | None = None
    for delay in (0, *RETRY_DELAYS_S):
        if delay:
            time.sleep(delay)
        try:
            r = httpx.request(method, url, **kw)
            if r.status_code >= 500:
                last = httpx.HTTPStatusError(f"{r.status_code} from {url}", request=r.request, response=r)
                continue
            return r
        except httpx.TransportError as exc:
            last = exc
    assert last is not None
    raise last


def _task_path(settings: Settings, key: str) -> Path:
    return settings.ndvi_cache_dir / f"task_{key}.json"


def appeears_configured(settings: Settings) -> bool:
    return bool(settings.earthdata_username and settings.earthdata_password)


def _appeears_auth(settings: Settings) -> dict[str, str]:
    if _appeears_token["token"] and time.time() < _appeears_token["exp"] - 300:
        return {"Authorization": f"Bearer {_appeears_token['token']}"}
    r = _request("POST", f"{settings.appeears_url}/login",
                 auth=(settings.earthdata_username or "", settings.earthdata_password or ""), timeout=30.0)
    if r.status_code in (401, 403):
        raise RuntimeError("NASA Earthdata login was rejected; check EARTHDATA_USERNAME / EARTHDATA_PASSWORD")
    r.raise_for_status()
    body = r.json()
    exp = time.time() + 47 * 3600
    try:
        exp = datetime.fromisoformat(str(body.get("expiration")).replace("Z", "+00:00")).timestamp()
    except ValueError:
        pass
    _appeears_token.update(token=body["token"], exp=exp)
    return {"Authorization": f"Bearer {body['token']}"}


def parse_appeears_csv(text: str) -> list[Composite]:
    reader = csv.DictReader(io.StringIO(text))
    cols = reader.fieldnames or []
    ndvi_col = next((c for c in cols if c.endswith("_250m_16_days_NDVI")), None)
    rel_col = next((c for c in cols if c.endswith("_250m_16_days_pixel_reliability")), None)
    if not ndvi_col or "Date" not in cols:
        raise RuntimeError(f"Unexpected AppEEARS CSV columns: {cols[:12]}")
    out: list[Composite] = []
    for row in reader:
        try:
            day = date.fromisoformat(row["Date"][:10])
        except ValueError:
            continue
        rel_raw = row.get(rel_col) if rel_col else None
        try:
            rel = int(float(rel_raw)) if rel_raw not in (None, "") else None
        except ValueError:
            rel = None
        out.append(Composite(day, _scaled(row.get(ndvi_col)), rel))
    return out


def fetch_appeears(settings: Settings, lat: float, lon: float, start_year: int, job: JobState) -> list[Composite]:
    headers = _appeears_auth(settings)
    today = date.today()
    task = {
        "task_type": "point",
        "task_name": f"fieldshift_ndvi_{pixel_key(lat, lon)}",
        "params": {
            "dates": [{"startDate": f"01-01-{start_year}", "endDate": today.strftime("%m-%d-%Y")}],
            "layers": [
                {"product": APPEEARS_PRODUCT, "layer": "_250m_16_days_NDVI"},
                {"product": APPEEARS_PRODUCT, "layer": "_250m_16_days_pixel_reliability"},
            ],
            "coordinates": [{"latitude": round(lat, 5), "longitude": round(lon, 5), "id": "p1"}],
        },
    }
    # Resume a task submitted earlier for this pixel (e.g. before a network blip or a restart)
    # instead of asking NASA to process the same 20 years again.
    key = pixel_key(lat, lon)
    tpath = _task_path(settings, key)
    task_id = None
    if tpath.is_file():
        try:
            saved = json.loads(tpath.read_text(encoding="utf-8"))
            if time.time() - float(saved.get("submitted_at", 0)) < 7 * 86400:
                task_id = saved.get("task_id")
        except (OSError, ValueError):
            task_id = None
    if not task_id:
        r = _request("POST", f"{settings.appeears_url}/task", json=task, headers=headers, timeout=60.0)
        r.raise_for_status()
        task_id = r.json()["task_id"]
        try:
            tpath.parent.mkdir(parents=True, exist_ok=True)
            tpath.write_text(json.dumps({"task_id": task_id, "submitted_at": time.time()}), encoding="utf-8")
        except OSError:
            pass
    deadline = time.time() + settings.ndvi_task_timeout_seconds
    status = "pending"
    while time.time() < deadline:
        s = _request("GET", f"{settings.appeears_url}/task/{task_id}", headers=headers, timeout=30.0)
        if s.status_code == 404:  # task expired on NASA's side: forget it and submit again next time
            tpath.unlink(missing_ok=True)
            raise RuntimeError("AppEEARS no longer has this task; it will be resubmitted")
        s.raise_for_status()
        status = str(s.json().get("status", "pending"))
        job.message = f"NASA AppEEARS is preparing the NDVI history ({status})"
        if status == "done":
            break
        if status == "error":
            raise RuntimeError("AppEEARS reported an error for the NDVI task")
        time.sleep(15)
    if status != "done":
        raise RuntimeError("AppEEARS did not finish within the time limit; it will be retried on the next request")
    bundle = _request("GET", f"{settings.appeears_url}/bundle/{task_id}", headers=headers, timeout=30.0)
    bundle.raise_for_status()
    files = bundle.json().get("files", [])
    csv_file = next((f for f in files if str(f.get("file_name", "")).endswith("results.csv")), None) or next(
        (f for f in files if str(f.get("file_type")) == "csv"), None)
    if not csv_file:
        raise RuntimeError("AppEEARS bundle has no results CSV")
    dl = _request("GET", f"{settings.appeears_url}/bundle/{task_id}/{csv_file['file_id']}", headers=headers,
                  timeout=120.0, follow_redirects=True)
    dl.raise_for_status()
    composites = parse_appeears_csv(dl.text)
    tpath.unlink(missing_ok=True)
    return composites


# --------------------------------------------------------------------------------------------
# Job orchestration
# --------------------------------------------------------------------------------------------
def _run(settings: Settings, lat: float, lon: float, key: str, bare_threshold: float) -> None:
    job = _jobs[key]
    start_year = settings.power_history_start_year
    composites: list[Composite] | None = None
    provider = None
    try:
        job.message = "Checking the ORNL MODIS service"
        probe_pool = ThreadPoolExecutor(max_workers=1)
        try:
            reachable = probe_pool.submit(ornl_reachable, settings).result(timeout=ORNL_PROBE_LIMIT_S)
        except FutureTimeout:
            _ornl_probe.update(ok=False, at=time.time())
            reachable = False
        finally:
            probe_pool.shutdown(wait=False, cancel_futures=True)
        if reachable:
            job.message = "Downloading NDVI from the ORNL MODIS service"
            # Hard wall-clock limit: a stalled TLS handshake does not trip httpx per-phase timeouts.
            pool = ThreadPoolExecutor(max_workers=1)
            fut = pool.submit(fetch_ornl, settings, lat, lon, start_year)
            try:
                composites, provider = fut.result(timeout=ORNL_FIRST_RESULT_LIMIT_S), "ornl_daac"
            except FutureTimeout:
                _ornl_probe.update(ok=False, at=time.time())
                job.attempts.append(f"ORNL: no answer within {ORNL_FIRST_RESULT_LIMIT_S} s; skipped for 30 min")
            except (httpx.HTTPError, RuntimeError, ValueError) as exc:
                job.attempts.append(f"ORNL: {exc}")
            finally:
                pool.shutdown(wait=False, cancel_futures=True)
        else:
            job.attempts.append("ORNL: not reachable from this server (TLS handshake fails)")
        if composites is None and appeears_configured(settings):
            job.message = "Requesting NDVI from NASA AppEEARS"
            composites, provider = fetch_appeears(settings, lat, lon, start_year, job), "nasa_appeears"
        if composites is None:
            job.state = "not_configured"
            job.message = (
                "MODIS NDVI is not available: the ORNL service cannot be reached and no NASA Earthdata "
                "login is configured (EARTHDATA_USERNAME / EARTHDATA_PASSWORD)."
            )
            return
        summary = summarize(composites, bare_threshold)
        if not summary["n_composites_good"]:
            raise RuntimeError("no cloud-free NDVI composites for this pixel")
        payload = {
            "pixel_key": key, "lat": lat, "lon": lon, "provider": provider, "product": APPEEARS_PRODUCT,
            "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **summary,
        }
        path = _cache_path(settings, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
        job.state, job.provider, job.message = "ready", provider, "NDVI history is ready"
    except Exception as exc:  # noqa: BLE001 - reported to the caller, never crashes the API
        job.attempts.append(str(exc))
        job.state, job.message = "failed", f"NDVI retrieval failed: {exc}"


def status(settings: Settings, lat: float, lon: float, *, start: bool, bare_threshold: float = 0.2) -> dict[str, Any]:
    """Return `{state, provider, message, ...}` and start a background fetch when asked."""
    key = pixel_key(lat, lon)
    cached = load_cached(settings, lat, lon)
    if cached:
        return {"state": "ready", "provider": cached.get("provider"), "message": "NDVI history is ready",
                "pixel_key": key, "fetched_at": cached.get("fetched_at")}
    if not settings.ndvi_enabled:
        return {"state": "disabled", "provider": None, "message": "MODIS NDVI retrieval is turned off on this server.",
                "pixel_key": key}
    with _jobs_lock:
        job = _jobs.get(key)
        # Failed or unconfigured jobs are retried after 10 minutes (credentials may have been added).
        if start and (job is None or (job.state in ("failed", "not_configured") and time.time() - job.started_at > 600)):
            job = JobState(state="running", message="Starting NDVI retrieval")
            _jobs[key] = job
            threading.Thread(target=_run, args=(settings, lat, lon, key, bare_threshold), daemon=True,
                             name=f"ndvi-{key}").start()
    if job is None:
        return {"state": "not_started", "provider": None, "message": "", "pixel_key": key}
    return {"state": job.state, "provider": job.provider, "message": job.message, "pixel_key": key,
            "attempts": list(job.attempts), "elapsed_s": round(time.time() - job.started_at)}


def apply_to_profile(profile: FieldProfile, ndvi: dict[str, Any]) -> None:
    """Merge a cached NDVI summary into a live profile (monthly NDVI, climatology, bare days, now)."""
    by_month = {(r["year"], r["month"]): r["ndvi_mean"] for r in ndvi.get("monthly", [])}
    for rec in profile.monthly:
        v = by_month.get((rec.year, rec.month))
        if v is not None:
            rec.ndvi_mean = v
    profile.climatology["ndvi_monthly_mean"] = ndvi.get("ndvi_monthly_mean")
    profile.climatology["ndvi_peak_mean"] = ndvi.get("ndvi_peak_mean")
    profile.climatology["ndvi_peak_month"] = ndvi.get("ndvi_peak_month")
    profile.climatology["bare_days_est_mean"] = ndvi.get("bare_days_est_mean")
    profile.now["ndvi_latest"] = ndvi.get("ndvi_latest")
    latest_dates = dict(profile.now.get("latest_dates") or {})
    latest_dates["modis"] = ndvi.get("ndvi_latest_date")
    profile.now["latest_dates"] = latest_dates
    via = "ORNL DAAC web service" if ndvi.get("provider") == "ornl_daac" else "NASA AppEEARS"
    profile.data_sources["modis"] = (
        f"{SOURCE_LABEL}, pixel at {ndvi.get('lat'):.4f}, {ndvi.get('lon'):.4f}; {ndvi.get('period_start')} to "
        f"{ndvi.get('period_end')}; {ndvi.get('n_composites_good')} cloud-free composites; via {via}"
    )
    profile.data_quality["modis"] = "observed"
