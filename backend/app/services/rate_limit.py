"""Minimal in-process sliding-window rate limiter (single-process deployments)."""

from __future__ import annotations

from collections import defaultdict, deque
import threading
import time

from fastapi import HTTPException, Request

from app.api import get_request_settings

_WINDOW_SECONDS = 60.0
_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def reset_rate_limits() -> None:
    with _lock:
        _hits.clear()


def location_rate_limit(request: Request) -> None:
    """FastAPI dependency: HTTP 429 once a client exceeds the per-minute limit (0 disables)."""
    limit = get_request_settings(request).location_rate_limit_per_minute
    if limit <= 0:
        return
    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _lock:
        q = _hits[client]
        while q and now - q[0] > _WINDOW_SECONDS:
            q.popleft()
        if len(q) >= limit:
            retry = max(1, int(_WINDOW_SECONDS - (now - q[0])) + 1)
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded ({limit} location analyses per minute). Try again in {retry}s.",
                headers={"Retry-After": str(retry)},
            )
        q.append(now)
